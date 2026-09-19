import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getStats } from "@/lib/openwrt/system";

/** Polled by the dashboard to derive CPU load and per-interface traffic rates. */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getStats(cfg);
  });
}
