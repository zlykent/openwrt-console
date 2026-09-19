import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getConntrack } from "@/lib/openwrt/conntrack";

/** Active netfilter connection-tracking table (Status → Connections). */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getConntrack(cfg);
  });
}
