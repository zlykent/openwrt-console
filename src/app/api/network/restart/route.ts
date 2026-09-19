import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { restartNetwork } from "@/lib/openwrt/network";

export async function POST() {
  return handle(async () => {
    const cfg = await requireSession();
    await restartNetwork(cfg);
    return { ok: true };
  });
}
