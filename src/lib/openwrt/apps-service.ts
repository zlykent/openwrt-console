import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput } from "@/lib/ssh/client";
import { assertToken, shq } from "@/lib/ssh/quote";
import { chain, parseUciShow, uciCommit, uciShow } from "./uci";
import { getNeighbors } from "./dhcp";
import { getNetDevices } from "./iface";
import {
  appFilePaths,
  candidateSources,
  planFileWrites,
  planWrite,
  readAppConfig,
  serviceName,
  validateInstances,
  type AppSchema,
  type AppConfigPayload,
  type AppSummary,
  type CandidateOptions,
  type FileWrite,
  type SectionInstance,
  type ServiceOp,
  type ServiceState,
} from "./uci-schema";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * Device-side operations for schema-driven luci-app pages.
 *
 * Split out from the pure, isomorphic `uci-schema.ts` engine so client
 * components can import schema types/helpers without dragging `ssh2`
 * (a Node-only module) into the browser bundle. Only API route handlers
 * (server runtime) may import from here.
 */

/**
 * Read every file-backed field of a schema verbatim (one pooled SSH channel
 * per file, run concurrently). Missing/unreadable files yield "".
 */
export async function readAppFiles(
  cfg: DeviceConfig,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const entries = await Promise.all(
    paths.map(async (p) => {
      const r = await exec(cfg, `cat ${shq(p)} 2>/dev/null`).catch(() => null);
      return [p, r && r.code === 0 ? r.stdout : ""] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Stream file contents over stdin so no shell quoting of the payload is needed. */
export async function writeAppFiles(cfg: DeviceConfig, writes: FileWrite[]): Promise<void> {
  for (const w of writes) {
    assertToken(w.path, "file path");
    const r = await execWithInput(cfg, `cat > ${shq(w.path)}`, w.content);
    if (r.code !== 0) throw new DeviceCommandError(r.stderr.trim() || `Failed to write ${w.path}`);
  }
}

export async function getAppConfig(
  cfg: DeviceConfig,
  schema: AppSchema,
): Promise<AppConfigPayload> {
  const paths = appFilePaths(schema);
  // Only probe the live system for widgets that actually offer candidates;
  // LuCI builds those lists at render time from the ARP table and the kernel
  // interfaces, so they cannot live in the static schema.
  const sources = candidateSources(schema);
  const [res, files, neighbours, devices] = await Promise.all([
    exec(cfg, uciShow(schema.config)).catch(() => null),
    readAppFiles(cfg, paths),
    sources.includes("neighbours") ? getNeighbors(cfg) : Promise.resolve(undefined),
    sources.includes("devices") ? getNetDevices(cfg) : Promise.resolve(undefined),
  ]);
  const present = !!res && res.code === 0;
  const state = readAppConfig(schema, res?.stdout ?? "", present, files);
  const service = await getServiceState(cfg, serviceName(schema));
  const candidates: CandidateOptions = {};
  if (neighbours) candidates.neighbours = neighbours.map(({ ip, mac }) => ({ ip, mac }));
  if (devices) candidates.devices = devices;
  return { state, service, candidates };
}

export async function saveAppConfig(
  cfg: DeviceConfig,
  schema: AppSchema,
  instances: SectionInstance[],
  restart: boolean,
): Promise<{ ok: true }> {
  // The form validates too, but a hand-crafted request must not be able to
  // write a value CBI would reject (bad address, out-of-range integer).
  const issues = validateInstances(schema, instances);
  if (issues.length > 0) {
    throw new AppError(
      issues
        .map((i) => `${i.type}${i.ref ? ` (${i.ref})` : ""}.${i.option}: ${i.reason}${i.value ? ` ${i.value}` : ""}`)
        .join("; "),
    );
  }
  const res = await exec(cfg, uciShow(schema.config)).catch(() => null);
  const current = res && res.code === 0 ? parseUciShow(res.stdout) : [];
  const cmds = planWrite(schema, current, instances);
  if (cmds.length > 0) {
    cmds.push(uciCommit(schema.config));
    const r = await exec(cfg, chain(...cmds));
    if (r.code !== 0) throw new DeviceCommandError(r.stderr.trim() || "Failed to save configuration");
  }
  const paths = appFilePaths(schema);
  if (paths.length > 0) {
    const files = await readAppFiles(cfg, paths);
    await writeAppFiles(cfg, planFileWrites(schema, files, instances));
  }
  if (restart) {
    await exec(cfg, `/etc/init.d/${serviceName(schema)} restart 2>/dev/null || true`);
  }
  return { ok: true };
}

export async function getServiceState(cfg: DeviceConfig, svc: string): Promise<ServiceState> {
  const script =
    `s=/etc/init.d/${svc}; ` +
    `if [ -x "$s" ]; then echo installed; ` +
    `if "$s" enabled >/dev/null 2>&1; then echo enabled; else echo disabled; fi; ` +
    `if "$s" running >/dev/null 2>&1; then echo running; else echo stopped; fi; ` +
    `else echo missing; fi`;
  const res = await exec(cfg, script).catch(() => null);
  const lines = (res?.stdout ?? "").split("\n").map((l) => l.trim());
  return {
    installed: lines.includes("installed"),
    enabled: lines.includes("enabled"),
    running: lines.includes("running"),
  };
}

export async function serviceAction(
  cfg: DeviceConfig,
  svc: string,
  op: ServiceOp,
): Promise<{ ok: true }> {
  const res = await exec(cfg, `/etc/init.d/${svc} ${op}`);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || `Failed to ${op} ${svc}`);
  return { ok: true };
}

/** One shell loop probes config presence + init.d state for every app. */
export async function getAppsSummary(
  cfg: DeviceConfig,
  schemas: AppSchema[],
): Promise<AppSummary[]> {
  const entries = schemas.map((s) => `${s.slug}:${s.config}:${serviceName(s)}`).join(" ");
  const script = [
    `for e in ${entries}; do`,
    'slug=${e%%:*}; rest=${e#*:}; c=${rest%%:*}; svc=${rest##*:};',
    'p=0; i=0; n=0; r=0;',
    'uci -q show "$c" >/dev/null 2>&1 && p=1;',
    'if [ -x "/etc/init.d/$svc" ]; then i=1;',
    '"/etc/init.d/$svc" enabled >/dev/null 2>&1 && n=1;',
    '"/etc/init.d/$svc" running >/dev/null 2>&1 && r=1; fi;',
    'printf "%s\\t%s\\t%s\\t%s\\t%s\\n" "$slug" "$p" "$i" "$n" "$r";',
    "done",
  ].join(" ");
  const res = await exec(cfg, script);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to probe applications");
  const out: AppSummary[] = [];
  for (const line of res.stdout.split("\n")) {
    const [slug, p, i, n, r] = line.trim().split("\t");
    if (!slug) continue;
    out.push({ slug, present: p === "1", installed: i === "1", enabled: n === "1", running: r === "1" });
  }
  return out;
}
