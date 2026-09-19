import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { releaseRam } from "@/lib/openwrt/system";

/** luci-app-release_ram `admin/status/release_ram`: drop the kernel caches. */

export async function POST() {
  return handle(async () => {
    const cfg = await requireSession();
    return await releaseRam(cfg);
  });
}
