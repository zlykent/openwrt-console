import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getLeases } from "@/lib/openwrt/dhcp";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getLeases(cfg);
  });
}
