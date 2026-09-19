import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getNeighbors } from "@/lib/openwrt/dhcp";

/** ARP neighbours — the "who's online" list for devices that don't serve DHCP. */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getNeighbors(cfg);
  });
}
