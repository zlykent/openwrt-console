import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getUsage, resetUsage } from "@/lib/openwrt/wrtbwmon";

/**
 * luci-app-wrtbwmon `admin/nlbw/usage/details`: GET runs the official
 * `usage_data` call (update + publish + parse), POST runs `usage_reset`.
 */

const actionSchema = z.object({ op: z.enum(["reset"]) });

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getUsage(cfg);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { op } = actionSchema.parse(await req.json());
    if (op === "reset") return await resetUsage(cfg);
    return { ok: true } as const;
  });
}
