import { Client, type ConnectConfig } from "ssh2";
import type { DeviceConfig } from "@/lib/config";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string;
};

export type SshErrorKind = "auth" | "connect" | "timeout" | "exec" | "unknown";

/** Structured SSH failure so the API layer can map it to a friendly message. */
export class SshError extends Error {
  readonly kind: SshErrorKind;
  readonly detail?: string;
  constructor(kind: SshErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "SshError";
    this.kind = kind;
    this.detail = detail;
  }
}

const clients = new Map<string, Client>();
const pending = new Map<string, Promise<Client>>();
const broken = new Set<string>();

const CONNECT_TIMEOUT = 12_000;
const DEFAULT_EXEC_TIMEOUT = 20_000;

function keyOf(cfg: DeviceConfig): string {
  return `${cfg.host}:${cfg.port}:${cfg.username}`;
}

function classify(err: unknown): SshErrorKind {
  const e = err as { level?: string; message?: string };
  const msg = String(e?.message ?? "").toLowerCase();
  const level = String(e?.level ?? "").toLowerCase();
  if (level.includes("authentication") || msg.includes("auth")) return "auth";
  if (level.includes("timeout") || msg.includes("timed out") || msg.includes("timeout"))
    return "timeout";
  if (
    level.includes("socket") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enetunreachable") ||
    msg.includes("ehostunreachable") ||
    msg.includes("getaddrinfo") ||
    msg.includes("socket")
  )
    return "connect";
  return "unknown";
}

function connect(cfg: DeviceConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const connCfg: ConnectConfig = {
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      readyTimeout: CONNECT_TIMEOUT,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
      // Dropbear on OpenWrt is fine with ssh2 defaults; allow older algs too.
      tryKeyboard: false,
    };
    let settled = false;
    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      const kind = classify(err);
      reject(new SshError(kind, (err as Error)?.message ?? "SSH error", String((err as Error)?.message ?? "")));
    };
    client.once("ready", () => {
      if (settled) return;
      settled = true;
      resolve(client);
    });
    client.once("error", onError);
    client.connect(connCfg);
  });
}

async function getClient(cfg: DeviceConfig): Promise<Client> {
  const key = keyOf(cfg);
  const existing = clients.get(key);
  if (existing && !broken.has(key)) return existing;

  const inflight = pending.get(key);
  if (inflight) return inflight;

  const promise = connect(cfg)
    .then((client) => {
      clients.set(key, client);
      broken.delete(key);
      const invalidate = () => {
        broken.add(key);
        clients.delete(key);
      };
      client.once("error", invalidate);
      client.once("close", invalidate);
      client.once("end", invalidate);
      return client;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

function execOn(client: Client, command: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new SshError("timeout", `Command timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    client.exec(command, (err, stream) => {
      if (err) {
        finish(() => reject(new SshError("exec", err.message, String(err.message))));
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      stream.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      stream.on("error", (e: Error) => {
        finish(() => reject(new SshError("exec", e.message, String(e.message))));
      });
      stream.on("close", (code: number | null, signal?: string) => {
        finish(() => resolve({ stdout, stderr, code: code ?? null, signal }));
      });
    });
  });
}

/** Run a command on the device, transparently (re)using a pooled connection. */
export async function exec(
  cfg: DeviceConfig,
  command: string,
  opts?: { timeoutMs?: number },
): Promise<ExecResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT;
  const key = keyOf(cfg);
  let client = await getClient(cfg);
  try {
    return await execOn(client, command, timeoutMs);
  } catch (err) {
    // Stale pooled connection: drop it, reconnect once and retry.
    if (err instanceof SshError && (err.kind === "exec" || err.kind === "timeout")) {
      broken.add(key);
      clients.delete(key);
      try {
        client.end();
      } catch {
        /* ignore */
      }
      client = await getClient(cfg);
      return await execOn(client, command, timeoutMs);
    }
    throw err;
  }
}

/** Run a command and parse its stdout as JSON (returns null when empty/invalid). */
export async function execJson<T = unknown>(
  cfg: DeviceConfig,
  command: string,
  opts?: { timeoutMs?: number },
): Promise<T | null> {
  const r = await exec(cfg, command, opts);
  const text = r.stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Run a command, writing `input` to its stdin first. Used for interactive
 * tools such as `passwd` so secrets never appear in the process argv.
 */
export async function execWithInput(
  cfg: DeviceConfig,
  command: string,
  input: string,
  opts?: { timeoutMs?: number },
): Promise<ExecResult> {
  const client = await getClient(cfg);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new SshError("timeout", `Command timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    client.exec(command, (err, stream) => {
      if (err) {
        finish(() => reject(new SshError("exec", err.message, String(err.message))));
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      stream.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      stream.on("error", (e: Error) => {
        finish(() => reject(new SshError("exec", e.message, String(e.message))));
      });
      stream.on("close", (code: number | null, signal?: string) => {
        finish(() => resolve({ stdout, stderr, code: code ?? null, signal }));
      });
      try {
        stream.stdin.write(input);
        stream.stdin.end();
      } catch {
        /* stream may already be closing */
      }
    });
  });
}

/**
 * Validate credentials by connecting and issuing a trivial call.
 * Throws SshError with kind "auth" for bad credentials, "connect"/"timeout"
 * for unreachable devices.
 */
export async function testConnection(cfg: DeviceConfig): Promise<void> {
  const client = await getClient(cfg);
  await execOn(client, "ubus call system board", DEFAULT_EXEC_TIMEOUT);
}

/** Close and forget any pooled connection for the given device. */
export function closeConnection(cfg: DeviceConfig): void {
  const key = keyOf(cfg);
  const client = clients.get(key);
  clients.delete(key);
  broken.delete(key);
  try {
    client?.end();
  } catch {
    /* ignore */
  }
}

// ---- SFTP binary transfer (backup / firmware images) ----

function getSftp(cfg: DeviceConfig): Promise<import("ssh2").SFTPWrapper> {
  return getClient(cfg).then(
    (client) =>
      new Promise<import("ssh2").SFTPWrapper>((resolve, reject) => {
        client.sftp((err, sftp) => (err ? reject(new SshError("exec", err.message, err.message)) : resolve(sftp)));
      }),
  );
}

/** Write a buffer to a remote path over SFTP (streamed, no argv exposure). */
export async function uploadFile(cfg: DeviceConfig, remotePath: string, data: Buffer): Promise<void> {
  const sftp = await getSftp(cfg);
  await new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath, { mode: 0o600 });
    stream.on("close", () => resolve());
    stream.on("error", (e: Error) => reject(new SshError("exec", e.message, e.message)));
    stream.end(data);
  });
}

/** Read a remote file into memory over SFTP. */
export async function downloadFile(cfg: DeviceConfig, remotePath: string): Promise<Buffer> {
  const sftp = await getSftp(cfg);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", (d: Buffer) => chunks.push(d));
    stream.on("error", (e: Error) => reject(new SshError("exec", e.message, e.message)));
    stream.on("close", () => resolve(Buffer.concat(chunks)));
  });
}
