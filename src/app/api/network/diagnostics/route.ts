import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { runDiagnostic } from "@/lib/openwrt/diagnostics";

const DiagSchema = z.object({
  tool: z.enum(["ping", "traceroute", "nslookup"]),
  target: z.string().min(1).max(253),
});

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = DiagSchema.parse(await req.json());
    return await runDiagnostic(cfg, body.tool, body.target);
  });
}
