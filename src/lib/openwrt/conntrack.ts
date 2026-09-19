import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";

/** One tracked connection from the netfilter conntrack table. */
export type ConntrackEntry = {
  /** Layer-4 protocol name: tcp / udp / icmp / ... */
  proto: string;
  /** Connection state for stateful protos (ESTABLISHED, TIME_WAIT...); "" otherwise. */
  state: string;
  /** Seconds until the entry expires. */
  timeout: number;
  /** Original-direction source address. */
  src: string;
  /** Original-direction destination address. */
  dst: string;
  /** Original-direction source port (or icmp type when absent). */
  sport: string;
  /** Original-direction destination port (or icmp code when absent). */
  dport: string;
};

export type ConntrackState = {
  supported: boolean;
  entries: ConntrackEntry[];
  count: number;
};

const STATE_TOKEN = /^[A-Z][A-Z_]+$/;

/**
 * Parse `/proc/net/nf_conntrack` (or `conntrack -L`) output.
 *
 * Each line: `<proto> <l3num> <timeout> [STATE] key=value ... [reply tuple] ...`
 * Only the FIRST (original-direction) src/dst/sport/dport are kept.
 */
export function parseConntrack(text: string): ConntrackEntry[] {
  const out: ConntrackEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tok = trimmed.split(/\s+/);
    if (tok.length < 3) continue;
    const proto = tok[0];
    const timeout = Number(tok[2]);
    let idx = 3;
    let state = "";
    if (tok[idx] && STATE_TOKEN.test(tok[idx]) && !tok[idx].includes("=")) {
      state = tok[idx];
      idx += 1;
    }
    let src = "";
    let dst = "";
    let sport = "";
    let dport = "";
    let type = "";
    let code = "";
    for (let i = idx; i < tok.length; i++) {
      const eq = tok[i].indexOf("=");
      if (eq < 0) continue;
      const k = tok[i].slice(0, eq);
      const v = tok[i].slice(eq + 1);
      // Keep only the first occurrence (original direction).
      if (k === "src" && !src) src = v;
      else if (k === "dst" && !dst) dst = v;
      else if (k === "sport" && !sport) sport = v;
      else if (k === "dport" && !dport) dport = v;
      else if (k === "type" && !type) type = v;
      else if (k === "code" && !code) code = v;
    }
    if (!src && !dst) continue;
    out.push({
      proto,
      state,
      timeout: Number.isFinite(timeout) ? timeout : 0,
      src,
      dst,
      sport: sport || type,
      dport: dport || code,
    });
  }
  return out;
}

/** Read the active conntrack table; degrades to supported:false when absent. */
export async function getConntrack(cfg: DeviceConfig): Promise<ConntrackState> {
  let res = await exec(cfg, "cat /proc/net/nf_conntrack 2>/dev/null");
  if (!res.stdout.trim()) {
    // Fall back to the userspace tool when the proc entry is not exposed.
    res = await exec(cfg, "conntrack -L 2>/dev/null");
  }
  if (!res.stdout.trim()) return { supported: false, entries: [], count: 0 };
  const entries = parseConntrack(res.stdout);
  return { supported: true, entries, count: entries.length };
}
