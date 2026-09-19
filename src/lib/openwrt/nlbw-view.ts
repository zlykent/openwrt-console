import { formatLuciMetric } from "@/lib/format";
import type { NlbwRecord } from "./nlbwmon";

/**
 * Pure, client-safe aggregation for the nlbwmon display view.
 *
 * Faithful port of the `query()` / `renderHostData()` / `renderLayer7Data()` /
 * `renderIPv6Data()` helpers in the official `luci/view/nlbw/display.htm`.
 * Grouping keeps the first record's descriptive columns and sums the five
 * counters; ordering is always descending by rx+tx bytes.
 */

/** nlbwmon reports traffic it cannot attribute to a MAC under this address. */
export const OTHER_MAC = "00:00:00:00:00:00";

/** `%1024.2mB` */
export const nlbwBytes = (v: number): string => formatLuciMetric(v, 1024, "B");
/** `%1000.2mP` */
export const nlbwPackets = (v: number): string => formatLuciMetric(v, 1000, "P");
/** `%1000m` */
export const nlbwCount = (v: number): string => formatLuciMetric(v, 1000, "");

const SUMMED: (keyof NlbwRecord)[] = ["conns", "rx_bytes", "rx_pkts", "tx_bytes", "tx_pkts"];

const byTotalDesc = (a: NlbwRecord, b: NlbwRecord): number =>
  b.rx_bytes + b.tx_bytes - (a.rx_bytes + a.tx_bytes);

/** Official `query(filter, group, order)` with a descending rx+tx ordering. */
export function aggregate(
  rows: NlbwRecord[],
  groupBy: (keyof NlbwRecord)[],
  filter?: (row: NlbwRecord) => boolean,
): NlbwRecord[] {
  const records = new Map<string, NlbwRecord>();
  const result: NlbwRecord[] = [];

  for (const row of rows) {
    if (filter && !filter(row)) continue;
    const key = groupBy.map((g) => row[g]).join(",");
    const existing = records.get(key);
    if (!existing) {
      const rec = { ...row };
      records.set(key, rec);
      result.push(rec);
      continue;
    }
    for (const col of SUMMED) {
      // SUMMED holds only numeric columns; the cast keeps the accumulator typed.
      const field = col as "conns" | "rx_bytes" | "rx_pkts" | "tx_bytes" | "tx_pkts";
      existing[field] += row[field];
    }
  }

  return result.sort(byTotalDesc);
}

/** "Traffic Distribution" table: hosts that actually moved bytes. */
export function hostRows(rows: NlbwRecord[]): NlbwRecord[] {
  return aggregate(
    rows,
    ["mac"],
    (r) => r.rx_bytes > 0 || r.tx_bytes > 0,
  );
}

/** "Application Protocols" table. */
export function layer7Rows(rows: NlbwRecord[]): NlbwRecord[] {
  return aggregate(rows, ["layer7"]);
}

/** "IPv6" table source rows, grouped per address family and host. */
export function ipv6Rows(rows: NlbwRecord[]): NlbwRecord[] {
  return aggregate(rows, ["family", "mac"]);
}

/** Official host key: MAC, or the IP for unattributed traffic. */
export function hostKey(rec: NlbwRecord): string {
  const mac = rec.mac.toUpperCase();
  return mac !== OTHER_MAC ? mac : rec.ip;
}

export interface HostTotals {
  hosts: number;
  rx: number;
  tx: number;
  conns: number;
}

export function hostTotals(rows: NlbwRecord[]): HostTotals {
  let rx = 0;
  let tx = 0;
  let conns = 0;
  for (const r of rows) {
    rx += r.rx_bytes;
    tx += r.tx_bytes;
    conns += r.conns;
  }
  return { hosts: rows.length, rx, tx, conns };
}

export interface Layer7Totals {
  total: number;
  /** Top three protocol names by download / upload / connections. */
  topRx: string[];
  topTx: string[];
  topConn: string[];
}

/** Mirrors the official `topRx` / `topTx` / `topConn` seeding and sorting. */
export function layer7Totals(rows: NlbwRecord[]): Layer7Totals {
  const top = (pick: (r: NlbwRecord) => number): string[] => {
    // Three empty seeds so the official "show at most three" slice never
    // under-fills when the period has fewer protocols than that.
    const seeded: [number, string][] = [
      [0, ""],
      [0, ""],
      [0, ""],
    ];
    return seeded
      .concat(rows.filter((r) => r.layer7).map((r): [number, string] => [pick(r), r.layer7]))
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([, name]) => name)
      .filter(Boolean);
  };

  return {
    total: rows.length,
    topRx: top((r) => r.rx_bytes),
    topTx: top((r) => r.tx_bytes),
    topConn: top((r) => r.conns),
  };
}

export interface Ipv6Host {
  mac: string;
  v4: NlbwRecord | null;
  v6: NlbwRecord | null;
}

export interface Ipv6Totals {
  hosts: Ipv6Host[];
  rx4: number;
  tx4: number;
  rx6: number;
  tx6: number;
  v4Only: number;
  v6Only: number;
  dualStack: number;
  /** Percentage of hosts with IPv6 (dual-stack counts as IPv6-capable). */
  hostRate: number;
  /** Percentage of all bytes that are IPv6. */
  trafficShare: number;
}

export function ipv6Totals(rows: NlbwRecord[]): Ipv6Totals {
  const totals: Ipv6Totals = {
    hosts: [],
    rx4: 0,
    tx4: 0,
    rx6: 0,
    tx6: 0,
    v4Only: 0,
    v6Only: 0,
    dualStack: 0,
    hostRate: 0,
    trafficShare: 0,
  };

  const families = new Map<string, number>();
  const records = new Map<string, Ipv6Host>();

  for (const rec of rows) {
    const mac = rec.mac.toUpperCase();
    const fam = families.get(mac) ?? 0;
    if (rec.family === 4) {
      totals.rx4 += rec.rx_bytes;
      totals.tx4 += rec.tx_bytes;
      families.set(mac, fam | 1);
    } else {
      totals.rx6 += rec.rx_bytes;
      totals.tx6 += rec.tx_bytes;
      families.set(mac, fam | 2);
    }
    const host = records.get(mac) ?? { mac, v4: null, v6: null };
    if (rec.family === 4) host.v4 = rec;
    else host.v6 = rec;
    records.set(mac, host);
  }

  for (const fam of families.values()) {
    if (fam === 3) totals.dualStack += 1;
    else if (fam === 2) totals.v6Only += 1;
    else if (fam === 1) totals.v4Only += 1;
  }

  // The table skips unattributed traffic entirely.
  totals.hosts = [...records.values()].filter((h) => h.mac !== OTHER_MAC);

  const hostCount = totals.dualStack + totals.v4Only + totals.v6Only;
  totals.hostRate = hostCount > 0 ? (100 / hostCount) * (totals.dualStack + totals.v6Only) : 0;
  const byteCount = totals.rx4 + totals.tx4 + totals.rx6 + totals.tx6;
  totals.trafficShare = byteCount > 0 ? (100 / byteCount) * (totals.rx6 + totals.tx6) : 0;

  return totals;
}

// ---- doughnut chart slices (official `pie()`) ----

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

/** Official colour ramp: `hsl(120/(n-1)*i, 80%, 50%)`. */
export function sliceColor(index: number, count: number): string {
  const hue = count > 1 ? (120 / (count - 1)) * index : 0;
  return `hsl(${Math.round(hue)}, 80%, 50%)`;
}

const NO_TRAFFIC: PieSlice = { name: "", value: 1, color: "#cccccc" };

/** Sorts descending and falls back to the official grey "no traffic" slice. */
function finalize(slices: PieSlice[]): PieSlice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  if (sorted.length === 0 || (sorted.length === 1 && sorted[0].value === 0)) return [NO_TRAFFIC];
  return sorted.map((s, i) => ({ ...s, color: s.color || sliceColor(i, sorted.length) }));
}

export function trafficPie(rows: NlbwRecord[]): PieSlice[] {
  return finalize(rows.map((r) => ({ name: hostKey(r), value: r.rx_bytes + r.tx_bytes, color: "" })));
}

export function connectionsPie(rows: NlbwRecord[]): PieSlice[] {
  return finalize(rows.map((r) => ({ name: hostKey(r), value: r.conns, color: "" })));
}

export function layer7RxPie(rows: NlbwRecord[], otherLabel: string): PieSlice[] {
  return finalize(rows.map((r) => ({ name: r.layer7 || otherLabel, value: r.rx_bytes, color: "" })));
}

export function layer7TxPie(rows: NlbwRecord[], otherLabel: string): PieSlice[] {
  return finalize(rows.map((r) => ({ name: r.layer7 || otherLabel, value: r.tx_bytes, color: "" })));
}

/** Fixed official colours: IPv4 hsl(140), IPv6 hsl(180). */
export function ipv6SharePie(t: Ipv6Totals): PieSlice[] {
  const slices: PieSlice[] = [];
  if (t.rx4 > 0 || t.tx4 > 0)
    slices.push({ name: "IPv4", value: t.rx4 + t.tx4, color: "hsl(140, 100%, 50%)" });
  if (t.rx6 > 0 || t.tx6 > 0)
    slices.push({ name: "IPv6", value: t.rx6 + t.tx6, color: "hsl(180, 100%, 50%)" });
  return finalize(slices);
}

/** Fixed official colours: v4-only hsl(140), v6-only hsl(180), dual hsl(50). */
export function ipv6HostsPie(t: Ipv6Totals, labels: { v4: string; v6: string; dual: string }): PieSlice[] {
  const slices: PieSlice[] = [];
  if (t.v4Only > 0) slices.push({ name: labels.v4, value: t.v4Only, color: "hsl(140, 100%, 50%)" });
  if (t.v6Only > 0) slices.push({ name: labels.v6, value: t.v6Only, color: "hsl(180, 100%, 50%)" });
  if (t.dualStack > 0) slices.push({ name: labels.dual, value: t.dualStack, color: "hsl(50, 100%, 50%)" });
  return finalize(slices);
}
