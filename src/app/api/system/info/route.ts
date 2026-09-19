import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getSystemInfo } from "@/lib/openwrt/system";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getSystemInfo(cfg);
  });
}
