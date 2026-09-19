import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { readKernelLog, readLogs } from "@/lib/openwrt/logs";

/** GET /api/logs?type=syslog|kernel&lines=N */
export async function GET(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "kernel" ? "kernel" : "syslog";
    const raw = Number(url.searchParams.get("lines") ?? "200");
    const lines = Number.isFinite(raw) ? Math.min(2000, Math.max(1, Math.floor(raw))) : 200;
    return type === "kernel" ? await readKernelLog(cfg, lines) : await readLogs(cfg, lines);
  });
}
