import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getUserFile, setUserFile } from "@/lib/openwrt/wrtbwmon";

/**
 * luci-app-wrtbwmon `admin/nlbw/usage/custom`: SimpleForm over
 * `/etc/config/wrtbwmon.user` (`00:aa:bb:cc:ee:ff,username` per line).
 */

const userFileSchema = z.object({ content: z.string().max(64_000) });

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return { content: await getUserFile(cfg) };
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { content } = userFileSchema.parse(await req.json());
    return await setUserFile(cfg, content);
  });
}
