import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getWireless, reloadWireless } from "@/lib/openwrt/wireless";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getWireless(cfg);
  });
}

const schema = z.object({ action: z.enum(["reload"]) });

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    schema.parse(await req.json());
    await reloadWireless(cfg);
    return { ok: true };
  });
}
