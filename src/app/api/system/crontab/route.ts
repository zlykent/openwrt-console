import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getCrontab, setCrontab } from "@/lib/openwrt/crontab";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    const content = await getCrontab(cfg);
    return { content };
  });
}

const CrontabSchema = z.object({ content: z.string() });

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { content } = CrontabSchema.parse(await req.json());
    return await setCrontab(cfg, content);
  });
}
