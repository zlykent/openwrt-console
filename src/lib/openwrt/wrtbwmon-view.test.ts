import { describe, expect, it } from "vitest";
import {
  aggregateHostTotals,
  formatUsageSize,
  parseUsageHtml,
  sortUsageRows,
  usageDateToIso,
  usageDatabasePath,
  usageTotals,
  USAGE_SORT_COLUMNS,
  withSpeeds,
} from "./wrtbwmon-view";

/** Verbatim excerpt of a `wrtbwmon publish` result from the device. */
const PUBLISHED = `<html><head><title>Traffic</title></head>
<body><h1>Total Usage:</h1>
<table border="1">
<script type="text/javascript">
var values = new Array(

new Array("b6:f0:2d:2f:4f:b8","b6:f0:2d:2f:4f:b8","192.168.3.3",
0.000000,0,0,"16-09-2026_23:58:31","16-09-2026_23:58:31"),

new Array("router","9c:2d:cd:2d:c3:3d","192.168.3.2",
1024.000000,2048,3072,"16-09-2026_07:56:11","16-09-2026_08:00:00"),

new Array("router","9c:2d:cd:2d:c3:3d","192.168.3.4",
512.000000,512,1024,"16-09-2026_07:56:11","16-09-2026_08:00:00"),
0);
var totalIn = 0;
</script></table>
</body></html>`;

describe("parseUsageHtml", () => {
  it("reads every row of the published values array", () => {
    const rows = parseUsageHtml(PUBLISHED);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      user: "b6:f0:2d:2f:4f:b8",
      mac: "b6:f0:2d:2f:4f:b8",
      ip: "192.168.3.3",
      in: 0,
      out: 0,
      total: 0,
      firstSeen: "16-09-2026_23:58:31",
    });
    expect(rows[1].in).toBe(1024);
    expect(rows[1].total).toBe(3072);
  });

  it("returns no rows when the block is missing", () => {
    expect(parseUsageHtml("<html></html>")).toEqual([]);
  });
});

describe("usageDateToIso", () => {
  it("normalises the database stamp like the official getDateString", () => {
    expect(usageDateToIso("16-09-2026_07:56:11")).toBe("2026-09-16T07:56:11");
    expect(usageDateToIso("n/a")).toBeNull();
  });
});

describe("usageDatabasePath", () => {
  it("follows the persist flag", () => {
    expect(usageDatabasePath(true)).toBe("/etc/config/usage.db");
    expect(usageDatabasePath(false)).toBe("/tmp/usage.db");
  });
});

describe("formatUsageSize", () => {
  it("uses base 1000 with the official precision switch", () => {
    // The shipped getSize() uses ' ' as the byte prefix, hence the double space.
    expect(formatUsageSize(0)).toBe("0  B");
    expect(formatUsageSize(999)).toBe("999  B");
    // Math.round() on one decimal, exactly like the shipped getSize().
    expect(formatUsageSize(1500)).toBe("2 kB");
    expect(formatUsageSize(1_500_000)).toBe("2 MB");
    expect(formatUsageSize(1_234_567_890)).toBe("1.235 GB");
  });
});

describe("withSpeeds", () => {
  it("derives per-poll speeds from the previous sample", () => {
    const rows = parseUsageHtml(PUBLISHED);
    const previous = rows.map((r) => ({ ...r, in: r.in / 2, out: r.out / 2 }));
    const out = withSpeeds(rows, previous, 2);
    expect(out[1].dlSpeed).toBe(256); // (1024 - 512) / 2s
    expect(out[1].upSpeed).toBe(512); // (2048 - 1024) / 2s
  });

  it("reports zero speeds on the first sample", () => {
    const out = withSpeeds(parseUsageHtml(PUBLISHED), undefined, 0);
    expect(out.every((e) => e.dlSpeed === 0 && e.upSpeed === 0)).toBe(true);
  });
});

describe("aggregateHostTotals", () => {
  it("inserts a sub-total row after each multi-row host", () => {
    const rows = withSpeeds(parseUsageHtml(PUBLISHED), undefined, 0);
    const out = aggregateHostTotals(rows);
    expect(out).toHaveLength(4);
    expect(out[3].hostTotal).toBe(true);
    expect(out[3].row.in).toBe(1536);
    expect(out[3].row.total).toBe(4096);
  });

  it("keeps single-row hosts untouched", () => {
    const rows = withSpeeds(parseUsageHtml(PUBLISHED), undefined, 0).slice(0, 1);
    expect(aggregateHostTotals(rows)).toHaveLength(1);
  });
});

describe("sorting and totals", () => {
  it("sorts by the official column ordinals", () => {
    const rows = withSpeeds(parseUsageHtml(PUBLISHED), undefined, 0);
    const desc = sortUsageRows(rows, USAGE_SORT_COLUMNS.total, "desc");
    expect(desc.map((e) => e.row.total)).toEqual([3072, 1024, 0]);
    const asc = sortUsageRows(rows, USAGE_SORT_COLUMNS.total, "asc");
    expect(asc.map((e) => e.row.total)).toEqual([0, 1024, 3072]);
    const byClient = sortUsageRows(rows, USAGE_SORT_COLUMNS.client, "asc");
    expect(byClient.map((e) => e.row.user)).toEqual([
      "b6:f0:2d:2f:4f:b8",
      "router",
      "router",
    ]);
  });

  it("sums the five official total columns", () => {
    const rows = withSpeeds(parseUsageHtml(PUBLISHED), undefined, 0);
    expect(usageTotals(rows)).toEqual([0, 0, 1536, 2560, 4096]);
  });
});
