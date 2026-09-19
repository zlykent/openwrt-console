import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getRcLocal, setRcLocal } from "@/lib/openwrt/startup";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getRcLocal(cfg);
  });
}

const RcLocalSchema = z.object({ content: z.string() });

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { content } = RcLocalSchema.parse(await req.json());
    return await setRcLocal(cfg, content);
  });
}
