/**
 * Pure, client-safe view helpers for luci-app-wrtbwmon ("Usage").
 *
 * Faithful port of `/www/luci-static/wrtbwmon/wrtbwmon.js`: the published
 * `var values = new Array(...)` block is parsed into rows, per-poll speeds are
 * derived from the previous sample, optional per-host sub-totals are inserted
 * and the table is sorted by the clicked column ordinal.
 */

export type UsageRow = {
  /** Column 0 of the published values array: host name or MAC address. */
  user: string;
  mac: string;
  ip: string;
  /** Bytes, as reported by the database. */
  in: number;
  out: number;
  total: number;
  /** Raw `dd-mm-yyyy_hh:mm:ss` stamp. */
  firstSeen: string;
  lastSeen: string;
  /** Normalised ISO stamp, matching the official `getDateString`. */
  firstSeenIso: string | null;
  lastSeenIso: string | null;
};

export type UsageState = {
  rows: UsageRow[];
  persist: boolean;
  dbPath: string;
  /** Server time of the sample, for the official "数据更新时间" label. */
  updatedAt: string;
};

/** One rendered table row: the raw database values plus computed speeds. */
export type UsageDisplayRow = {
  row: UsageRow;
  dlSpeed: number;
  upSpeed: number;
  /** Sub-total row inserted by `aggregateHostTotals` (official "(host total)"). */
  hostTotal?: boolean;
};

export const WRTBWMON_DB_TMP = "/tmp/usage.db";
export const WRTBWMON_DB_PERSIST = "/etc/config/usage.db";
export const WRTBWMON_USER_FILE = "/etc/config/wrtbwmon.user";

/** Official `usage_database_path()`. */
export function usageDatabasePath(persist: boolean): string {
  return persist ? WRTBWMON_DB_PERSIST : WRTBWMON_DB_TMP;
}

/** Official `getDateString()`: `16-09-2026_07:56:11` → `2026-09-16T07:56:11`. */
export function usageDateToIso(value: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})_(\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}`;
}

const QUOTED = '"((?:[^"\\\\]|\\\\.)*)"';
const NUM = "([0-9.eE+-]+)";
const VALUES_BLOCK = /var values = new Array\(([\s\S]*?)\);/;
const ROW = new RegExp(
  `new Array\\(\\s*${QUOTED}\\s*,\\s*${QUOTED}\\s*,\\s*${QUOTED}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${QUOTED}\\s*,\\s*${QUOTED}\\s*\\)`,
  "g",
);

/**
 * Parse the published HTML the way `wrtbwmon.js` does: grab the
 * `var values = new Array(...)` block and read every 8-element row out of it.
 */
export function parseUsageHtml(html: string): UsageRow[] {
  const block = VALUES_BLOCK.exec(html);
  if (!block) return [];
  const rows: UsageRow[] = [];
  for (const m of block[1].matchAll(ROW)) {
    const [, user, mac, ip, inn, out, total, firstSeen, lastSeen] = m;
    rows.push({
      user,
      mac,
      ip,
      in: Number(inn) || 0,
      out: Number(out) || 0,
      total: Number(total) || 0,
      firstSeen,
      lastSeen,
      firstSeenIso: usageDateToIso(firstSeen),
      lastSeenIso: usageDateToIso(lastSeen),
    });
  }
  return rows;
}

/** Official `getSize()`: base 1000, three decimals above megabytes. */
export function formatUsageSize(size: number): string {
  const prefix = [" ", "k", "M", "G", "T", "P", "E", "Z"];
  const base = 1000;
  let value = size;
  let pos = 0;
  while (value > base && pos < prefix.length - 1) {
    value /= base;
    pos += 1;
  }
  const precision = pos > 2 ? 1000 : 1;
  return `${Math.round(value * precision) / precision} ${prefix[pos]}B`;
}

/**
 * Official `parseValueRow()`: speeds are the delta against the previous poll
 * matched by MAC + IP, divided by the elapsed seconds. Without a previous
 * sample both speeds are 0.
 */
export function withSpeeds(
  rows: UsageRow[],
  previous: UsageRow[] | undefined,
  elapsedSeconds: number,
): UsageDisplayRow[] {
  const seconds = elapsedSeconds > 0 ? elapsedSeconds : 0;
  return rows.map((row) => {
    const old = previous?.find((p) => p.mac === row.mac && p.ip === row.ip);
    const dlSpeed = old ? (row.in - old.in) / seconds : 0;
    const upSpeed = old ? (row.out - old.out) / seconds : 0;
    return { row, dlSpeed: Number.isFinite(dlSpeed) ? dlSpeed : 0, upSpeed: Number.isFinite(upSpeed) ? upSpeed : 0 };
  });
}

/** Official `aggregateHostTotals()`: group rows per host and add sub-totals. */
export function aggregateHostTotals(rows: UsageDisplayRow[]): UsageDisplayRow[] {
  const groups = new Map<string, UsageDisplayRow[]>();
  for (const entry of rows) {
    const key = entry.row.user.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const result: UsageDisplayRow[] = [];
  for (const group of groups.values()) {
    result.push(...group);
    if (group.length < 2) continue;
    const sums = group.reduce(
      (acc, e) => ({
        in: acc.in + e.row.in,
        out: acc.out + e.row.out,
        total: acc.total + e.row.total,
        dlSpeed: acc.dlSpeed + e.dlSpeed,
        upSpeed: acc.upSpeed + e.upSpeed,
      }),
      { in: 0, out: 0, total: 0, dlSpeed: 0, upSpeed: 0 },
    );
    const first = group[0];
    result.push({
      row: {
        ...first.row,
        user: first.row.user,
        in: sums.in,
        out: sums.out,
        total: sums.total,
        firstSeen: "",
        lastSeen: "",
        firstSeenIso: null,
        lastSeenIso: null,
      },
      dlSpeed: sums.dlSpeed,
      upSpeed: sums.upSpeed,
      hostTotal: true,
    });
  }
  return result;
}

/**
 * Sort ordinals of the official `rowData` array:
 * `[user, mac, ip, dlSpeed, upSpeed, in, out, total, firstSeen, lastSeen]`.
 */
export const USAGE_SORT_COLUMNS = {
  client: 0,
  download: 3,
  upload: 4,
  totalDown: 5,
  totalUp: 6,
  total: 7,
} as const;

export type UsageSortColumn = (typeof USAGE_SORT_COLUMNS)[keyof typeof USAGE_SORT_COLUMNS];

function sortValue(entry: UsageDisplayRow, column: UsageSortColumn): string | number {
  switch (column) {
    case 0:
      return entry.row.user;
    case 3:
      return entry.dlSpeed;
    case 4:
      return entry.upSpeed;
    case 5:
      return entry.row.in;
    case 6:
      return entry.row.out;
    default:
      return entry.row.total;
  }
}

/** Official `sortingFunction()`: `desc` when the same column is clicked twice. */
export function sortUsageRows(
  rows: UsageDisplayRow[],
  column: UsageSortColumn,
  dir: "asc" | "desc",
): UsageDisplayRow[] {
  return [...rows].sort((x, y) => {
    const a = sortValue(x, column);
    const b = sortValue(y, column);
    if (a === b) return 0;
    if (dir === "desc") return a < b ? 1 : -1;
    return a > b ? 1 : -1;
  });
}

/** Official totals row: `[dlSpeed, upSpeed, in, out, total]` sums. */
export function usageTotals(rows: UsageDisplayRow[]): [number, number, number, number, number] {
  return rows.reduce<[number, number, number, number, number]>(
    (acc, e) => [acc[0] + e.dlSpeed, acc[1] + e.upSpeed, acc[2] + e.row.in, acc[3] + e.row.out, acc[4] + e.row.total],
    [0, 0, 0, 0, 0],
  );
}

/** The official `#intervalSelect` options (`-1` disables auto refresh). */
export const USAGE_REFRESH_INTERVALS: { value: number; seconds: number; minutes?: number }[] = [
  { value: -1, seconds: 0 },
  { value: 1, seconds: 1 },
  { value: 2, seconds: 2 },
  { value: 3, seconds: 3 },
  { value: 4, seconds: 4 },
  { value: 5, seconds: 5 },
  { value: 10, seconds: 10 },
  { value: 20, seconds: 20 },
  { value: 30, seconds: 30 },
  { value: 40, seconds: 40 },
  { value: 50, seconds: 50 },
  { value: 60, seconds: 60 },
  { value: 120, seconds: 120, minutes: 2 },
  { value: 180, seconds: 180, minutes: 3 },
  { value: 240, seconds: 240, minutes: 4 },
  { value: 360, seconds: 360, minutes: 5 },
];
