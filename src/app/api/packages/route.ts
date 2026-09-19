import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getInstalled } from "@/lib/openwrt/packages";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getInstalled(cfg);
  });
}
