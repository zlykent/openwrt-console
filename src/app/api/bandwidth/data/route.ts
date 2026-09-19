import { requireSession } from "@/lib/auth/session";
import { handle, mapError } from "@/lib/api/respond";
import { getNlbwCsv, getNlbwData } from "@/lib/openwrt/nlbwmon";

/**
 * Mirrors the official `admin/nlbw/data` action: `type=csv|json`, optional
 * `period`, `group_by`, `order_by` and `delim` query parameters are passed
 * through to `/usr/sbin/nlbw -c <type>`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "json";
  const query = {
    period: url.searchParams.get("period") ?? undefined,
    groupBy: url.searchParams.get("group_by") ?? undefined,
    orderBy: url.searchParams.get("order_by") ?? undefined,
  };

  if (type === "csv") {
    try {
      const cfg = await requireSession();
      const csv = await getNlbwCsv(cfg, query);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="nlbwmon-export.csv"',
        },
      });
    } catch (e) {
      return mapError(e);
    }
  }

  return handle(async () => {
    const cfg = await requireSession();
    const rows = await getNlbwData(cfg, query);
    return { rows };
  });
}
