import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getInterfaces } from "@/lib/openwrt/network";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getInterfaces(cfg);
  });
}
