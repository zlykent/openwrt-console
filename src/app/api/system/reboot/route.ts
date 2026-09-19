import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { reboot } from "@/lib/openwrt/system";

export async function POST() {
  return handle(async () => {
    const cfg = await requireSession();
    await reboot(cfg);
    return { ok: true };
  });
}
