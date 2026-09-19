import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getAppsSummary } from "@/lib/openwrt/apps-service";
import { APP_LIST } from "@/lib/openwrt/apps";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getAppsSummary(cfg, APP_LIST);
  });
}
