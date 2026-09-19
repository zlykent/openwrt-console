import type { CpuCounters, InterfaceCounters } from "./types";

/** Parse `/proc/net/dev` into per-interface byte/packet counters. */
export function parseProcNetDev(text: string): Record<string, InterfaceCounters> {
  const out: Record<string, InterfaceCounters> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue; // skip the two header lines
    const name = line.slice(0, idx).trim();
    if (!name) continue;
    const f = line.slice(idx + 1).trim().split(/\s+/).map(Number);
    if (f.length < 16 || f.some((n) => Number.isNaN(n))) continue;
    out[name] = {
      rxBytes: f[0],
      rxPackets: f[1],
      txBytes: f[8],
      txPackets: f[9],
    };
  }
  return out;
}

/** Parse the aggregate `cpu` line of `/proc/stat` into idle/total jiffies. */
export function parseCpuLine(text: string): CpuCounters {
  const line = text.split("\n").find((l) => /^cpu\s/.test(l));
  if (!line) return { idle: 0, total: 0 };
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  const total = f.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  // idle + iowait are considered non-busy.
  const idle = (f[3] ?? 0) + (f[4] ?? 0);
  return { idle, total };
}

/** Parse `/proc/loadavg` into three floats. */
export function parseLoadavg(text: string): [number, number, number] {
  const f = text.trim().split(/\s+/).map(Number);
  return [f[0] ?? 0, f[1] ?? 0, f[2] ?? 0];
}

/** Split a combined shell capture on `@@MARKER` section headers. */
export function parseSections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = text.split(/^@@(\w+)\s*$/m);
  // parts[0] is preamble (usually empty); then [marker, body, marker, body...]
  for (let i = 1; i + 1 < parts.length + 1; i += 2) {
    const key = parts[i];
    const body = parts[i + 1] ?? "";
    if (key) out[key] = body.replace(/^\n/, "");
  }
  return out;
}
