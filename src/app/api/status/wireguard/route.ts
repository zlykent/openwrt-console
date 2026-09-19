import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getWireguardStatus } from "@/lib/openwrt/wireguard";

/**
 * Status > WireGuard — mirrors `wg show all dump` as the official view does.
 * The page polls this endpoint (official polls every 5 s).
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getWireguardStatus(cfg);
  });
}
