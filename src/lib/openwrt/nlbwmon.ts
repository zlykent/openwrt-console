import type { DeviceConfig } from "@/lib/config";
import { exec, execJson, execWithInput, uploadFile } from "@/lib/ssh/client";
import { assertToken, shq } from "@/lib/ssh/quote";
import {
  boolOption,
  chain,
  firstOption,
  listOption,
  parseUciShow,
  uciCommit,
  uciSet,
} from "./uci";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * luci-app-nlbwmon — "Netlink Bandwidth Monitor".
 *
 * Mirrors the official controller (`luci/controller/nlbw.lua`), the CBI model
 * (`luci/model/cbi/nlbw/config.lua`) and the display template. The controller
 * shells out to `/usr/sbin/nlbw -c {list,json,csv,commit}`, tars the database
 * directory for download and untars an uploaded archive for restore.
 *
 * Two options are *virtual* in the official CBI model and are reconstructed
 * here the same way:
 * - `database_interval` is either a plain day-of-month ("relative" period) or
 *   a `<YYYY-MM-DD>/<days>` pair ("absolute" period).
 * - `local_network` is one mixed list holding both subnets and interface
 *   names; the form splits it into `_subnets` (DynamicList) and `_ifaces`
 *   (network netlist) and merges them back on write.
 */

export const NLBW_BIN = "/usr/sbin/nlbw";
export const NLBW_INIT = "/etc/init.d/nlbwmon";
export const NLBW_PROTOCOLS_FILE = "/usr/share/nlbwmon/protocols";
export const NLBW_DEFAULT_DIR = "/var/lib/nlbwmon";
export const NLBW_RESTORE_TMP = "/tmp/nlbw-restore.tar.gz";

/** Accounting period selector values (official `_period` ListValue). */
export const NLBW_PERIODS = ["relative", "absolute"] as const;
export type NlbwPeriodType = (typeof NLBW_PERIODS)[number];

/** Column names `nlbw -c json` can emit; also the only legal group/order keys. */
export const NLBW_COLUMNS = [
  "family",
  "proto",
  "port",
  "mac",
  "ip",
  "conns",
  "rx_bytes",
  "rx_pkts",
  "tx_bytes",
  "tx_pkts",
  "layer7",
] as const;

/** `^YYYY-MM-DD/YYYY-MM-DD` style database_interval (official Lua pattern). */
export const ABSOLUTE_INTERVAL = /^(\d{4}-\d{2}-\d{2})\/(\d+)$/;
/** Anything that looks like an address rather than an interface name. */
const SUBNET_LIKE = /^[\dA-Fa-f.:/]+$/;
/** `nlbw -c list` prints either `YYYY-MM-DD` or `YYYYMMDD`. */
const PERIOD_TOKEN = /^\d{4}-\d{2}-\d{2}$|^\d{8}$/;

export interface NlbwRecord {
  family: number;
  proto: string;
  port: number;
  mac: string;
  ip: string;
  conns: number;
  rx_bytes: number;
  rx_pkts: number;
  tx_bytes: number;
  tx_pkts: number;
  layer7: string;
}

export interface NlbwConfigState {
  installed: boolean;
  /** Whether `nlbwmon.@nlbwmon[0]` already exists. */
  present: boolean;
  /** Raw `database_interval` value, exactly as stored. */
  databaseInterval: string;
  period: NlbwPeriodType;
  /** Day of month (relative period). */
  interval: string;
  /** Start date `YYYY-MM-DD` (absolute period). */
  date: string;
  /** Interval length in days (absolute period). */
  days: string;
  /** Raw `local_network` list. */
  localNetwork: string[];
  /** Interface-name half of `local_network`. */
  ifaces: string[];
  /** Address half of `local_network`. */
  subnets: string[];
  /** Interface names offered by the netlist widget. */
  availableIfaces: string[];
  databaseLimit: string;
  databasePrealloc: boolean;
  databaseCompress: boolean;
  databaseGenerations: string;
  commitInterval: string;
  refreshInterval: string;
  databaseDirectory: string;
  /** Contents of `/usr/share/nlbwmon/protocols`. */
  protocols: string;
  /** Periods available in the database (`nlbw -c list`). */
  periods: string[];
}

export interface NlbwConfigInput {
  period: NlbwPeriodType;
  interval: string;
  date: string;
  days: string;
  ifaces: string[];
  subnets: string[];
  databaseLimit: string;
  databasePrealloc: boolean;
  databaseCompress: boolean;
  databaseGenerations: string;
  commitInterval: string;
  refreshInterval: string;
  databaseDirectory: string;
  protocols: string;
}

export interface NlbwQuery {
  period?: string;
  groupBy?: string;
  orderBy?: string;
}

// ---- pure helpers (unit-testable) ----

/** Split the raw `database_interval` into the three official form values. */
export function parseInterval(raw: string): {
  period: NlbwPeriodType;
  interval: string;
  date: string;
  days: string;
} {
  const m = ABSOLUTE_INTERVAL.exec(raw);
  if (m) return { period: "absolute", interval: "", date: m[1], days: m[2] };
  return { period: "relative", interval: raw, date: "", days: "" };
}

/** Inverse of `parseInterval`, matching the official `period.write`. */
export function formatInterval(input: Pick<NlbwConfigInput, "period" | "interval" | "date" | "days">): string {
  if (input.period === "absolute") return `${input.date.trim()}/${input.days.trim()}`;
  return input.interval.trim();
}

/** Split `local_network` into addresses and interface names. */
export function splitLocalNetwork(items: string[]): { subnets: string[]; ifaces: string[] } {
  const subnets: string[] = [];
  const ifaces: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    if (SUBNET_LIKE.test(item) && /[.:/]/.test(item)) subnets.push(item);
    else ifaces.push(item);
  }
  return { subnets, ifaces };
}

/** Validate a `group_by`/`order_by` list against the known column set. */
export function assertColumnList(value: string, label: string): string {
  const out = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (out.length === 0) throw new AppError(`Invalid ${label}`);
  for (const col of out) {
    const name = col.startsWith("-") ? col.slice(1) : col;
    if (!NLBW_COLUMNS.includes(name as (typeof NLBW_COLUMNS)[number])) {
      throw new AppError(`Invalid ${label} column: ${col}`);
    }
  }
  return out.join(",");
}

/** Validate a period token as printed by `nlbw -c list`. */
export function assertPeriod(value: string): string {
  const period = value.trim();
  if (!PERIOD_TOKEN.test(period)) throw new AppError(`Invalid accounting period: ${value}`);
  return period;
}

/** Turn `nlbw -c json` output into typed records. */
export function parseNlbwJson(payload: {
  columns?: unknown;
  data?: unknown;
} | null): NlbwRecord[] {
  if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.data)) return [];
  const index: Record<string, number> = {};
  payload.columns.forEach((c, i) => {
    index[String(c)] = i;
  });
  const at = (row: unknown[], col: string): unknown => row[index[col]];

  return payload.data.filter(Array.isArray).map((row) => ({
    family: Number(at(row, "family") ?? 0),
    proto: String(at(row, "proto") ?? ""),
    port: Number(at(row, "port") ?? 0),
    mac: String(at(row, "mac") ?? ""),
    ip: String(at(row, "ip") ?? ""),
    conns: Number(at(row, "conns") ?? 0),
    rx_bytes: Number(at(row, "rx_bytes") ?? 0),
    rx_pkts: Number(at(row, "rx_pkts") ?? 0),
    tx_bytes: Number(at(row, "tx_bytes") ?? 0),
    tx_pkts: Number(at(row, "tx_pkts") ?? 0),
    layer7: at(row, "layer7") == null ? "" : String(at(row, "layer7")),
  }));
}

/** Build the `nlbw -c json` command line (all dynamic parts validated). */
export function buildNlbwDataCommand(q: NlbwQuery): string {
  const args: string[] = ["-c", "json"];
  if (q.period) args.push("-t", shq(assertPeriod(q.period)));
  if (q.groupBy) args.push("-g", shq(assertColumnList(q.groupBy, "group_by")));
  if (q.orderBy) args.push("-o", shq(assertColumnList(q.orderBy, "order_by")));
  return `${NLBW_BIN} ${args.join(" ")} 2>/dev/null`;
}

/** Build the CSV command used by the official "Export" tab links. */
export function buildNlbwCsvCommand(q: NlbwQuery, delim = ";"): string {
  const sep = delim === "," || delim === "\t" ? delim : ";";
  const args: string[] = ["-c", "csv", `-s${shq(sep)}`];
  if (q.period) args.push("-t", shq(assertPeriod(q.period)));
  if (q.groupBy) args.push("-g", shq(assertColumnList(q.groupBy, "group_by")));
  if (q.orderBy) args.push("-o", shq(assertColumnList(q.orderBy, "order_by")));
  return `${NLBW_BIN} ${args.join(" ")} 2>/dev/null`;
}

/**
 * Files inside a backup archive that the official restore accepts.
 *
 * `member` is the name exactly as `tar -t` lists it (the archive is created
 * with `tar -C <dir> -c -z .`, so members carry a `./` prefix) and must be
 * passed back verbatim when unpacking; `name` is the bare file name used for
 * validation and status messages.
 */
export function filterBackupEntries(stdout: string): { member: string; name: string }[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((f) => /^(\.\/)?\d{8}\.db\.gz$/.test(f))
    .map((member) => ({ member, name: member.replace(/^\.\//, "") }));
}

// ---- device access ----

const SECTION = "@nlbwmon[0]";

async function readDatabaseDirectory(cfg: DeviceConfig): Promise<string> {
  const res = await exec(cfg, `uci -q get nlbwmon.${SECTION}.database_directory`).catch(() => null);
  const dir = (res?.stdout ?? "").trim();
  if (!dir) return NLBW_DEFAULT_DIR;
  assertToken(dir, "database directory");
  return dir;
}

export async function getNlbwConfig(cfg: DeviceConfig): Promise<NlbwConfigState> {
  const [uciRes, protoRes, listRes, netRes, installedRes] = await Promise.all([
    exec(cfg, "uci -q show nlbwmon").catch(() => null),
    exec(cfg, `cat ${shq(NLBW_PROTOCOLS_FILE)} 2>/dev/null`).catch(() => null),
    exec(cfg, `${NLBW_BIN} -c list 2>/dev/null`).catch(() => null),
    exec(cfg, "uci -q show network").catch(() => null),
    exec(cfg, `[ -x ${NLBW_BIN} ] && echo YES`).catch(() => null),
  ]);

  const sections = parseUciShow(uciRes?.stdout ?? "");
  const sec = sections.find((s) => s.type === "nlbwmon");
  const rawInterval = firstOption(sec, "database_interval", "");
  const localNetwork = listOption(sec, "local_network");
  const { subnets, ifaces } = splitLocalNetwork(localNetwork);
  const availableIfaces = parseUciShow(netRes?.stdout ?? "")
    .filter((s) => s.type === "interface" && !s.anonymous)
    .map((s) => s.name);

  return {
    installed: (installedRes?.stdout ?? "").includes("YES"),
    present: !!sec,
    databaseInterval: rawInterval,
    ...parseInterval(rawInterval),
    localNetwork,
    ifaces,
    subnets,
    availableIfaces,
    databaseLimit: firstOption(sec, "database_limit", ""),
    databasePrealloc: boolOption(sec, "database_prealloc"),
    // Official default is "enabled" (compress.default = compress.enabled).
    databaseCompress: sec ? boolOption(sec, "database_compress") : true,
    databaseGenerations: firstOption(sec, "database_generations", ""),
    commitInterval: firstOption(sec, "commit_interval", ""),
    refreshInterval: firstOption(sec, "refresh_interval", ""),
    databaseDirectory: firstOption(sec, "database_directory", NLBW_DEFAULT_DIR),
    protocols: protoRes?.stdout ?? "",
    periods: (listRes?.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => PERIOD_TOKEN.test(l)),
  };
}

/** Validate the submitted form the way the CBI datatypes would. */
export function validateNlbwConfig(input: NlbwConfigInput): void {
  if (!NLBW_PERIODS.includes(input.period)) throw new AppError("Invalid accounting period type");
  if (input.period === "relative") {
    const n = Number(input.interval);
    if (!Number.isInteger(n) || (n < 1 && n > -31) || n > 31 || n === 0) {
      throw new AppError("Due date must be between 1 and 31, or -1 and -31");
    }
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) throw new AppError("Start date must be YYYY-MM-DD");
    const days = Number(input.days);
    if (!Number.isInteger(days) || days < 1) throw new AppError("Interval must be at least 1 day");
  }
  for (const item of [...input.ifaces, ...input.subnets]) assertToken(item, "local network entry");
  if (input.databaseDirectory.trim()) assertToken(input.databaseDirectory.trim(), "database directory");
  for (const n of [input.databaseLimit, input.databaseGenerations]) {
    if (n.trim() && !/^\d+$/.test(n.trim())) throw new AppError("Maximum entries and stored periods must be integers");
  }
}

export async function saveNlbwConfig(cfg: DeviceConfig, input: NlbwConfigInput): Promise<void> {
  validateNlbwConfig(input);
  const sets = [
    uciSet("nlbwmon", SECTION, "database_interval", formatInterval(input)),
    // Official write order: subnets first, then interfaces.
    uciSet("nlbwmon", SECTION, "local_network", [...input.subnets, ...input.ifaces]),
    uciSet("nlbwmon", SECTION, "database_limit", input.databaseLimit.trim()),
    uciSet("nlbwmon", SECTION, "database_prealloc", input.databasePrealloc ? "1" : "0"),
    uciSet("nlbwmon", SECTION, "database_compress", input.databaseCompress ? "1" : "0"),
    uciSet("nlbwmon", SECTION, "database_generations", input.databaseGenerations.trim()),
    uciSet("nlbwmon", SECTION, "commit_interval", input.commitInterval.trim()),
    uciSet("nlbwmon", SECTION, "refresh_interval", input.refreshInterval.trim()),
    uciSet(
      "nlbwmon",
      SECTION,
      "database_directory",
      input.databaseDirectory.trim() || NLBW_DEFAULT_DIR,
    ),
    uciCommit("nlbwmon"),
  ];
  const res = await exec(cfg, chain(...sets));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to save nlbwmon configuration");

  // `_protocols` is a file-backed TextValue, written with CRLF normalisation.
  // The payload is streamed over stdin so arbitrary mapping text never reaches
  // a shell command line.
  const protocols = input.protocols.replace(/\r\n/g, "\n");
  const current = await exec(cfg, `cat ${shq(NLBW_PROTOCOLS_FILE)} 2>/dev/null`).catch(() => null);
  if ((current?.stdout ?? "") !== protocols) {
    const write = await execWithInput(cfg, `cat > ${shq(NLBW_PROTOCOLS_FILE)}`, protocols);
    if (write.code !== 0) throw new DeviceCommandError(write.stderr.trim() || `Failed to write ${NLBW_PROTOCOLS_FILE}`);
  }

  await exec(cfg, `${NLBW_INIT} restart`).catch(() => null);
}

export async function getNlbwData(cfg: DeviceConfig, q: NlbwQuery): Promise<NlbwRecord[]> {
  const payload = await execJson<{ columns?: unknown; data?: unknown }>(
    cfg,
    buildNlbwDataCommand(q),
    { timeoutMs: 30_000 },
  );
  return parseNlbwJson(payload);
}

export async function getNlbwCsv(cfg: DeviceConfig, q: NlbwQuery): Promise<string> {
  const res = await exec(cfg, buildNlbwCsvCommand(q), { timeoutMs: 30_000 });
  return res.stdout;
}

/** Official `admin/nlbw/commit`: force the in-memory database to disk. */
export async function commitNlbw(cfg: DeviceConfig): Promise<void> {
  await exec(cfg, `${NLBW_BIN} -c commit`, { timeoutMs: 30_000 }).catch(() => null);
}

export interface NlbwBackup {
  filename: string;
  /** tar.gz payload, base64-encoded for transport over JSON. */
  base64: string;
}

/** Official `admin/nlbw/download`: `tar -C <dir> -c -z . -f -`. */
export async function downloadNlbwBackup(cfg: DeviceConfig): Promise<NlbwBackup> {
  const dir = await readDatabaseDirectory(cfg);
  const hostRes = await exec(cfg, "cat /proc/sys/kernel/hostname 2>/dev/null").catch(() => null);
  const hostname = (hostRes?.stdout ?? "openwrt").trim() || "openwrt";
  const date = new Date().toISOString().slice(0, 10);
  const res = await exec(cfg, `/bin/tar -C ${shq(dir)} -c -z . -f - 2>/dev/null | /bin/base64`, {
    timeoutMs: 60_000,
  });
  const base64 = res.stdout.replace(/\s+/g, "");
  if (!base64) throw new AppError("Unable to find database directory");
  return { filename: `nlbwmon-backup-${hostname}-${date}.tar.gz`, base64 };
}

/**
 * Official `admin/nlbw/restore`: stage the upload, keep only the `*.db.gz`
 * members the archive is allowed to contain, stop the daemon, unpack and
 * start it again. Returns the restored file names for the status message.
 */
export async function restoreNlbwBackup(cfg: DeviceConfig, archive: Buffer): Promise<string[]> {
  const dir = await readDatabaseDirectory(cfg);
  await uploadFile(cfg, NLBW_RESTORE_TMP, archive);

  const listing = await exec(cfg, `/bin/tar -tzf ${shq(NLBW_RESTORE_TMP)} 2>/dev/null`, {
    timeoutMs: 60_000,
  });
  const files = filterBackupEntries(listing.stdout);
  if (files.length === 0) {
    await exec(cfg, `/bin/rm -f ${shq(NLBW_RESTORE_TMP)}`).catch(() => null);
    throw new AppError("Invalid or empty backup archive");
  }
  // Names already matched `^(\.\/)?\d{8}\.db\.gz$`; assertToken is a second
  // fence before they are interpolated into the unpack command.
  for (const f of files) assertToken(f.member, "archive entry");

  await exec(cfg, `${NLBW_INIT} stop`, { timeoutMs: 60_000 }).catch(() => null);
  await exec(cfg, `/bin/mkdir -p ${shq(dir)}`);
  const unpack = await exec(
    cfg,
    `/bin/tar -C ${shq(dir)} -vxzf ${shq(NLBW_RESTORE_TMP)} ${files.map((f) => shq(f.member)).join(" ")} 2>&1`,
    { timeoutMs: 60_000 },
  );
  await exec(cfg, `/bin/rm -f ${shq(NLBW_RESTORE_TMP)}`).catch(() => null);
  await exec(cfg, `${NLBW_INIT} start`, { timeoutMs: 60_000 }).catch(() => null);
  if (unpack.code !== 0) {
    throw new DeviceCommandError(unpack.stdout.trim() || unpack.stderr.trim() || "Failed to restore backup archive");
  }
  return files.map((f) => f.name);
}
