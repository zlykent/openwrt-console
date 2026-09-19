import type { DeviceConfig } from "@/lib/config";
import { exec, execJson, execWithInput, SshError } from "@/lib/ssh/client";
import { ubusCall, shq } from "@/lib/ssh/quote";
import { AppError } from "@/lib/api/errors";
import {
  chain,
  parseUciShow,
  uciCommit,
  uciCreateSection,
  uciDeleteIfExists,
  uciSet,
  uciShow,
  firstOption,
  listOption,
  boolOption,
} from "./uci";
import { isValidHostnameValue, isValidIpValue, isValidIpv4Value } from "./uci-schema";
import { parseCpuLine, parseLoadavg, parseProcNetDev, parseSections } from "./parse";
import type {
  BoardInfo,
  MemoryInfo,
  StatsSample,
  SwapInfo,
  SystemInfo,
  SystemSettings,
  TimezoneEntry,
} from "./types";

type RawBoard = {
  kernel?: string;
  hostname?: string;
  system?: string;
  model?: string;
  board_name?: string;
  release?: {
    distribution?: string;
    version?: string;
    revision?: string;
    target?: string;
    description?: string;
  };
};

type RawInfo = {
  localtime?: number;
  uptime?: number;
  load?: number[];
  memory?: Record<string, number>;
  swap?: Record<string, number>;
};

function toMemory(m: Record<string, number> = {}): MemoryInfo {
  const total = m.total ?? 0;
  const available = m.available ?? m.free ?? 0;
  return {
    total,
    free: m.free ?? 0,
    available,
    used: Math.max(0, total - available),
    cached: m.cached ?? 0,
    buffered: m.buffered ?? 0,
    shared: m.shared ?? 0,
  };
}

function toSwap(s: Record<string, number> = {}): SwapInfo {
  return { total: s.total ?? 0, free: s.free ?? 0 };
}

export async function getBoard(cfg: DeviceConfig): Promise<BoardInfo> {
  const raw = (await execJson<RawBoard>(cfg, ubusCall("system", "board"))) ?? {};
  const rel = raw.release ?? {};
  return {
    kernel: raw.kernel ?? "",
    hostname: raw.hostname ?? "",
    system: raw.system ?? "",
    model: raw.model ?? "",
    boardName: raw.board_name ?? "",
    release: {
      distribution: rel.distribution ?? "OpenWrt",
      version: rel.version ?? "",
      revision: rel.revision ?? "",
      target: rel.target ?? "",
      description: rel.description?.trim() || `${rel.distribution ?? "OpenWrt"} ${rel.version ?? ""}`.trim(),
    },
  };
}

export async function getSystemInfo(cfg: DeviceConfig): Promise<SystemInfo> {
  const [info, loadRes] = await Promise.all([
    execJson<RawInfo>(cfg, ubusCall("system", "info")),
    exec(cfg, "cat /proc/loadavg").catch(() => null),
  ]);
  const raw = info ?? {};
  const load = loadRes ? parseLoadavg(loadRes.stdout) : ([0, 0, 0] as [number, number, number]);
  return {
    uptime: raw.uptime ?? 0,
    localtime: raw.localtime ?? Math.floor(Date.now() / 1000),
    load,
    memory: toMemory(raw.memory),
    swap: toSwap(raw.swap),
  };
}

const STATS_CMD = [
  "printf '@@LOAD\\n'; cat /proc/loadavg",
  "printf '@@STAT\\n'; head -n1 /proc/stat",
  "printf '@@NET\\n'; cat /proc/net/dev",
  "printf '@@INFO\\n'; ubus call system info",
  "printf '@@END\\n'",
].join("; ");

/** One-shot sample used by the dashboard to derive CPU% and traffic rates. */
export async function getStats(cfg: DeviceConfig): Promise<StatsSample> {
  const res = await exec(cfg, STATS_CMD, { timeoutMs: 15000 });
  const s = parseSections(res.stdout);
  const info = safeJson<RawInfo>(s.INFO);
  return {
    at: Date.now(),
    uptime: info?.uptime ?? 0,
    load: parseLoadavg(s.LOAD ?? ""),
    cpu: parseCpuLine(s.STAT ?? ""),
    memory: toMemory(info?.memory),
    swap: toSwap(info?.swap),
    interfaces: parseProcNetDev(s.NET ?? ""),
  };
}

function safeJson<T>(text: string | undefined): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    return undefined;
  }
}

/**
 * Dump the device's own zone table — the very `luci.sys.zoneinfo.TZ` list that
 * LuCI fills its Timezone dropdown from (`admin_system/system.lua`). `[[...]]`
 * keeps the one-liner free of quotes so it survives any shell on the way there.
 */
const TIMEZONE_CMD =
  "lua -e 'local z=require([[luci.sys.zoneinfo]]); for _,e in ipairs(z.TZ) do print(e[1]..[[|]]..e[2]) end' 2>/dev/null";

/**
 * Parse the `name|tz` dump of the device's zone table. Returns an empty list
 * when the build has no Lua LuCI to read it from, which callers must treat as
 * "cannot derive" rather than as "no zones exist".
 */
export function parseTimezoneTable(stdout: string): TimezoneEntry[] {
  const parsed: TimezoneEntry[] = [];
  for (const line of stdout.split("\n")) {
    const bar = line.indexOf("|");
    if (bar <= 0) continue;
    const name = line.slice(0, bar).trim();
    const tz = line.slice(bar + 1).trim();
    if (name && tz) parsed.push({ name, tz });
  }
  if (parsed.length === 0) return [];
  // LuCI offers a bare "UTC" ahead of the table, and its lookup falls back to
  // "GMT0" for it, so UTC is not an entry of tzdata itself.
  return [{ name: "UTC", tz: "GMT0" }, ...parsed];
}

/** Zone name → POSIX TZ string, or an empty list when it cannot be read. */
export async function getTimezones(cfg: DeviceConfig): Promise<TimezoneEntry[]> {
  const res = await exec(cfg, TIMEZONE_CMD, { timeoutMs: 15000 }).catch(() => null);
  if (!res || res.code !== 0) return [];
  return parseTimezoneTable(res.stdout);
}

/**
 * The POSIX string the device maps `zonename` to.
 *
 * `/etc/init.d/system` writes `timezone` to /tmp/TZ and only consults
 * `zonename` when `/usr/share/zoneinfo/<zonename>` exists — which is absent on
 * most builds — so changing the zone without updating the POSIX string silently
 * keeps the old offset. LuCI derives it in its `write` hook for exactly this
 * reason; we read the same table off the device instead of shipping a copy.
 */
async function deriveTimezone(cfg: DeviceConfig, zonename: string): Promise<string | undefined> {
  if (zonename === "") return undefined;
  const zones = await getTimezones(cfg);
  if (zones.length === 0) return undefined;
  const hit = zones.find((z) => z.name === zonename);
  if (!hit) throw new AppError(`Unknown timezone: ${zonename}`);
  return hit.tz;
}

/** CBI `uinteger`, optionally bounded (`o.datatype` on the logging fields). */
function requireUint(value: string, option: string, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  if (!/^\d+$/.test(value)) {
    throw new AppError(`Invalid ${option}: ${value} (expected a positive integer)`);
  }
  const n = Number(value);
  if (n < min || n > max) {
    throw new AppError(`Invalid ${option}: ${value} (expected ${min}..${max})`);
  }
}

/** CBI `ListValue`: only the declared choices are acceptable. */
function requireOneOf(value: string, option: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new AppError(`Invalid ${option}: ${value} (expected ${allowed.join(" | ")})`);
  }
}

/** `conloglevel` (1..8) and `cronloglevel` (5|8|9) choices from system.lua. */
const CONLOGLEVELS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const CRONLOGLEVELS = ["5", "8", "9"];

export type SystemSettingsInput = {
  hostname?: string;
  zonename?: string;
  timezone?: string;
  logSize?: string;
  logIp?: string;
  logPort?: string;
  logProto?: string;
  logFile?: string;
  conloglevel?: string;
  cronloglevel?: string;
  ntpEnabled?: boolean;
  ntpServer?: boolean;
  ntpServers?: string[];
};

/**
 * The `o.datatype` declarations of `admin_system/system.lua`, enforced before a
 * single `uci` command is built so a bad draft can never reach the device.
 */
export function validateSystemInput(next: SystemSettingsInput): void {
  if (next.hostname !== undefined && next.hostname !== "" && !isValidHostnameValue(next.hostname)) {
    throw new AppError(`Invalid hostname: ${next.hostname}`);
  }
  if (next.logSize) requireUint(next.logSize, "log_size");
  if (next.logIp && !isValidIpv4Value(next.logIp)) {
    throw new AppError(`Invalid log_ip: ${next.logIp} (expected an IPv4 address)`);
  }
  if (next.logPort) requireUint(next.logPort, "log_port", 0, 65535);
  if (next.logProto) requireOneOf(next.logProto, "log_proto", ["udp", "tcp"]);
  if (next.logFile) {
    if (!next.logFile.startsWith("/") || /[\s'"]/.test(next.logFile)) {
      throw new AppError(`Invalid log_file: ${next.logFile} (expected an absolute path)`);
    }
  }
  if (next.conloglevel) requireOneOf(next.conloglevel, "conloglevel", CONLOGLEVELS);
  if (next.cronloglevel) requireOneOf(next.cronloglevel, "cronloglevel", CRONLOGLEVELS);
  for (const server of next.ntpServers ?? []) {
    // CBI `host(0)`: a hostname or an address, but never a port or a scheme.
    if (!isValidHostnameValue(server) && !isValidIpValue(server)) {
      throw new AppError(`Invalid NTP server: ${server}`);
    }
  }
}

export async function getSettings(cfg: DeviceConfig): Promise<SystemSettings> {
  const res = await exec(cfg, uciShow("system"));
  const secs = parseUciShow(res.stdout);
  const sys = secs.find((s) => s.type === "system");
  const ntp = secs.find((s) => s.name === "ntp" || s.type === "timeserver");
  return {
    hostname: firstOption(sys, "hostname", "OpenWrt"),
    zonename: firstOption(sys, "zonename", "UTC"),
    timezone: firstOption(sys, "timezone", "UTC0"),
    logSize: firstOption(sys, "log_size"),
    logIp: firstOption(sys, "log_ip"),
    logPort: firstOption(sys, "log_port"),
    logProto: firstOption(sys, "log_proto"),
    logFile: firstOption(sys, "log_file"),
    conloglevel: firstOption(sys, "conloglevel"),
    cronloglevel: firstOption(sys, "cronloglevel"),
    ntpEnabled: boolOption(ntp, "enabled"),
    ntpServer: boolOption(ntp, "enable_server"),
    ntpServers: listOption(ntp, "server"),
  };
}

export async function updateSettings(cfg: DeviceConfig, next: SystemSettingsInput): Promise<void> {
  validateSystemInput(next);

  const res = await exec(cfg, uciShow("system"));
  const secs = parseUciShow(res.stdout);
  const sys = secs.find((s) => s.type === "system");
  const ntp = secs.find((s) => s.name === "ntp" || s.type === "timeserver");
  const sysRef = sys?.name ?? "@system[0]";
  const cmds: string[] = [];

  /**
   * Write only what actually differs. This build's `uci set` moves an existing
   * option to the end of its section, so a redundant write still reorders the
   * config file — and `reload_config` then restarts half the box for nothing.
   */
  const write = (option: string, value: string, optional: boolean) => {
    if (value === firstOption(sys, option)) return;
    cmds.push(
      optional && value === ""
        ? uciDeleteIfExists("system", sysRef, option)
        : uciSet("system", sysRef, option, value),
    );
  };

  if (next.hostname !== undefined) write("hostname", next.hostname, false);
  if (next.zonename !== undefined) {
    write("zonename", next.zonename, false);
    // Keep the POSIX string in step with the zone unless the caller set it.
    if (next.timezone === undefined) {
      const derived = await deriveTimezone(cfg, next.zonename);
      if (derived !== undefined) write("timezone", derived, false);
    }
  }
  if (next.timezone !== undefined) write("timezone", next.timezone, false);

  // LuCI marks every logging field `o.optional = true`, so blanking one removes
  // the option instead of storing an empty string syslogd would choke on.
  if (next.logSize !== undefined) write("log_size", next.logSize, true);
  if (next.logIp !== undefined) write("log_ip", next.logIp, true);
  if (next.logPort !== undefined) write("log_port", next.logPort, true);
  if (next.logProto !== undefined) write("log_proto", next.logProto, true);
  if (next.logFile !== undefined) write("log_file", next.logFile, true);
  if (next.conloglevel !== undefined) write("conloglevel", next.conloglevel, true);
  if (next.cronloglevel !== undefined) write("cronloglevel", next.cronloglevel, true);

  const touchesNtp =
    next.ntpEnabled !== undefined || next.ntpServer !== undefined || next.ntpServers !== undefined;
  if (touchesNtp) {
    // LuCI offers a "Set up Time Synchronization" button for a config that has
    // no timeserver section yet; creating it here keeps the switch live instead
    // of silently doing nothing on such a device.
    const ntpRef = ntp?.name ?? "ntp";
    if (!ntp) cmds.push(uciCreateSection("system", ntpRef, "timeserver"));
    const flag = (option: string, value: boolean | undefined) => {
      if (value === undefined) return;
      const want = value ? "1" : "0";
      if (firstOption(ntp, option) === want) return;
      cmds.push(uciSet("system", ntpRef, option, want));
    };
    flag("enabled", next.ntpEnabled);
    flag("enable_server", next.ntpServer);
    if (next.ntpServers !== undefined && listOption(ntp, "server").join("\n") !== next.ntpServers.join("\n")) {
      cmds.push(uciSet("system", ntpRef, "server", next.ntpServers));
    }
  }

  if (cmds.length === 0) return;
  cmds.push(uciCommit("system"), "reload_config");
  const r = await exec(cfg, chain(...cmds), { timeoutMs: 20000 });
  if (r.code !== 0) {
    // Drop the staged delta so a half-applied section cannot be committed by an
    // unrelated later write.
    await exec(cfg, "uci revert system 2>/dev/null; true").catch(() => undefined);
    throw new SshError("exec", "Failed to apply system settings", (r.stderr || r.stdout).trim());
  }
}

/** Issue a delayed reboot so the SSH reply returns before the device goes down. */
export async function reboot(cfg: DeviceConfig): Promise<void> {
  await exec(cfg, "( sleep 2; reboot ) >/dev/null 2>&1 &", { timeoutMs: 8000 }).catch(() => {
    /* the channel may drop as the device reboots */
  });
}

/**
 * luci-app-release_ram — "Release Ram" (admin/status/release_ram).
 *
 * The official controller runs `sync && echo 3 > /proc/sys/vm/drop_caches`
 * and redirects back to admin/status. Here the memory is sampled before and
 * after the same call so the page can report how much was actually freed.
 */
export async function releaseRam(
  cfg: DeviceConfig,
): Promise<{ before: MemoryInfo; after: MemoryInfo; freed: number }> {
  const before = (await getSystemInfo(cfg)).memory;
  const r = await exec(cfg, "sync && echo 3 > /proc/sys/vm/drop_caches");
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to release memory", (r.stderr || r.stdout).trim());
  }
  const after = (await getSystemInfo(cfg)).memory;
  return { before, after, freed: Math.max(0, after.free - before.free) };
}

export async function changePassword(cfg: DeviceConfig, newPassword: string): Promise<void> {
  if (!newPassword) throw new SshError("exec", "Password must not be empty");
  const r = await execWithInput(cfg, `passwd ${shq(cfg.username)}`, `${newPassword}\n${newPassword}\n`);
  const combined = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0 || /fail|error|mismatch/i.test(combined)) {
    throw new SshError("exec", "Failed to change password", combined.trim());
  }
}
