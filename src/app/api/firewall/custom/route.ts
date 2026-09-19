import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getCustomRules, setCustomRules } from "@/lib/openwrt/firewall";

const putSchema = z.object({ content: z.string().max(128 * 1024) });

/**
 * LuCI "Custom Rules" tab — the `/etc/firewall.user` script appended to the
 * ruleset on every firewall (re)load.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getCustomRules(cfg);
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = putSchema.parse(await req.json());
    return await setCustomRules(cfg, body.content);
  });
}
