import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { serviceAction } from "@/lib/openwrt/services";

const schema = z.object({
  action: z.enum(["start", "stop", "restart", "reload", "enable", "disable"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { name } = await params;
    const { action } = schema.parse(await req.json());
    await serviceAction(cfg, name, action);
    return { ok: true };
  });
}
