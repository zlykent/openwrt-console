import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { interfaceAction } from "@/lib/openwrt/network";

const schema = z.object({ action: z.enum(["up", "down", "renew"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { name } = await params;
    const { action } = schema.parse(await req.json());
    await interfaceAction(cfg, name, action);
    return { ok: true };
  });
}
