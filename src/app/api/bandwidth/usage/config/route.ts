import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { setPersist } from "@/lib/openwrt/wrtbwmon";

/** luci-app-wrtbwmon `admin/nlbw/usage/config`: the single `persist` flag. */

const configSchema = z.object({ persist: z.boolean() });

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { persist } = configSchema.parse(await req.json());
    return await setPersist(cfg, persist);
  });
}
