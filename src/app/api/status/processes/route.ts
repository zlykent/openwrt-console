import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getProcesses, killProcess } from "@/lib/openwrt/processes";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getProcesses(cfg);
  });
}

const KillSchema = z.object({
  pid: z.number().int().positive(),
  signal: z.enum(["term", "kill"]).default("term"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = KillSchema.parse(await req.json());
    return await killProcess(cfg, body.pid, body.signal);
  });
}
