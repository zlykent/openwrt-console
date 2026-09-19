import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getServices } from "@/lib/openwrt/services";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getServices(cfg);
  });
}
