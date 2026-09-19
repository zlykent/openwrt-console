import type { DeviceConfig } from "@/lib/config";
import { exec, execJson, SshError } from "@/lib/ssh/client";
import { ubusCall } from "@/lib/ssh/quote";
import type { LogEntry } from "./types";

/** syslog(3) priority names, indexed by the numeric value ubus reports. */
const PRIORITIES = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"];

/** Month abbreviations used by `logread`'s human-readable timestamps. */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Level aliases some daemons emit; normalised to the syslog(3) spelling. */
const LEVEL_ALIASES: Record<string, string> = { error: "err", warn: "warning" };
const LEVELS = new Set(PRIORITIES.concat(Object.keys(LEVEL_ALIASES)));

function normalizeLevel(level: string): string {
  const l = level.toLowerCase();
  return LEVEL_ALIASES[l] ?? l;
}

type RawLogEntry = { t?: number; m?: string; p?: number; s?: number };

function clampLines(lines?: number): number {
  const n = Math.floor(Number(lines ?? 200));
  if (!Number.isFinite(n)) return 200;
  return Math.min(2000, Math.max(1, n));
}

/**
 * Parse one `logread` line into structured fields.
 *
 * Observed shape on the target device:
 *   `Tue Sep 15 21:52:17 2026 auth.info sshd[25931]: Accepted password ...`
 * i.e. `[weekday] month day hh:mm:ss [year] [facility.]level [tag[pid]:] message`.
 * Every group is optional so older/BusyBox variants still degrade gracefully —
 * anything unparseable is returned verbatim as the message with `time: 0`.
 *
 * The wall-clock is interpreted as UTC when deriving `time` purely so ordering
 * and filtering work; the UI shows `timeText` (the device's own string) to
 * avoid a misleading timezone shift.
 */
export function parseLogreadLine(line: string): LogEntry {
  let rest = line;
  let time = 0;
  let timeText: string | undefined;
  let priority: string | undefined;
  let source: string | undefined;

  // 1) Optional weekday + "Mon DD HH:MM:SS[ YYYY]"
  const dateRe = /^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s+(\d{4}))?\s+/;
  const dm = rest.match(dateRe);
  const month = dm ? MONTHS[dm[1].toLowerCase()] : undefined;
  if (dm && month !== undefined) {
    const year = dm[6] ? Number(dm[6]) : new Date().getUTCFullYear();
    const epoch = Date.UTC(year, month, Number(dm[2]), Number(dm[3]), Number(dm[4]), Number(dm[5]));
    if (Number.isFinite(epoch)) {
      time = Math.floor(epoch / 1000);
      timeText = dm[0].replace(/\s+$/, "");
      rest = rest.slice(dm[0].length);
    }
  }

  // 2) Optional "facility.level" or bare "level" token
  const priRe = /^(?:([A-Za-z0-9_-]+)\.)?([A-Za-z]+)\s+/;
  const pm = rest.match(priRe);
  if (pm && LEVELS.has(pm[2].toLowerCase())) {
    priority = normalizeLevel(pm[2]);
    rest = rest.slice(pm[0].length);
  }

  // 3) Optional "tag[pid]:" (or "tag:" when a priority preceded it) prefix
  const srcRe = priority
    ? /^([A-Za-z0-9._\/-]+)(?:\[(\d+)\])?:\s+/
    : /^([A-Za-z0-9._\/-]+)\[(\d+)\]:\s+/;
  const sm = rest.match(srcRe);
  if (sm) {
    source = sm[1];
    rest = rest.slice(sm[0].length);
  }

  const msg = rest.trim() || line.trimEnd();
  return { time, timeText, priority, source, msg };
}

/**
 * Read the system log through `ubus call log read`, which returns structured
 * entries (epoch seconds + numeric priority). Falls back to parsing `logread`
 * text on builds where the log ring buffer is empty or the object is missing.
 */
export async function readLogs(cfg: DeviceConfig, lines = 200): Promise<LogEntry[]> {
  const n = clampLines(lines);
  const raw = await execJson<{ log?: RawLogEntry[] }>(
    cfg,
    ubusCall("log", "read", { lines: n }),
  ).catch(() => null);

  if (Array.isArray(raw?.log) && raw!.log.length > 0) {
    return (raw!.log as RawLogEntry[])
      .filter((e) => e && typeof e.m === "string")
      .map((e) => ({
        time: Number(e.t ?? 0),
        priority: typeof e.p === "number" ? (PRIORITIES[e.p] ?? String(e.p)) : undefined,
        source: typeof e.s === "number" ? String(e.s) : undefined,
        msg: e.m as string,
      }))
      .reverse(); // newest first for the UI
  }

  // Fallback: parse `logread` text into structured entries.
  const r = await exec(cfg, `logread 2>/dev/null | tail -n ${n}`);
  return r.stdout
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .reverse() // newest first for the UI
    .map(parseLogreadLine);
}

/**
 * Kernel ring buffer via `dmesg`. Times are seconds since boot (not epoch), so
 * they are surfaced with `source: "kernel"` and rendered as "+12.34s".
 */
export async function readKernelLog(cfg: DeviceConfig, lines = 200): Promise<LogEntry[]> {
  const n = clampLines(lines);
  const r = await exec(cfg, `dmesg 2>/dev/null | tail -n ${n}`);
  const out: LogEntry[] = [];
  for (const line of r.stdout.split("\n")) {
    const t = line.trimEnd();
    if (!t) continue;
    const m = t.match(/^\[\s*([\d.]+)\]\s*(.*)$/);
    if (m) {
      out.push({ time: Number(m[1]), source: "kernel", msg: m[2] });
    } else {
      out.push({ time: 0, source: "kernel", msg: t });
    }
  }
  return out.reverse(); // newest first
}

/** Clear the kernel ring buffer (destructive; gated behind an explicit UI action). */
export async function clearKernelLog(cfg: DeviceConfig): Promise<void> {
  const r = await exec(cfg, "dmesg -c >/dev/null 2>&1 || dmesg -C 2>/dev/null || true");
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to clear kernel log", (r.stderr || r.stdout).trim());
  }
}
