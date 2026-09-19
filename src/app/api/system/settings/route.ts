import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getSettings, updateSettings } from "@/lib/openwrt/system";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getSettings(cfg);
  });
}

const schema = z.object({
  hostname: z.string().trim().min(1).max(64).optional(),
  zonename: z.string().trim().max(64).optional(),
  timezone: z.string().trim().max(32).optional(),
  // LuCI's "Logging" tab; each is `o.optional`, so "" means "remove the option".
  logSize: z.string().trim().max(8).optional(),
  logIp: z.string().trim().max(45).optional(),
  logPort: z.string().trim().max(5).optional(),
  logProto: z.enum(["udp", "tcp", ""]).optional(),
  logFile: z.string().trim().max(256).optional(),
  conloglevel: z.string().trim().max(2).optional(),
  cronloglevel: z.string().trim().max(2).optional(),
  ntpEnabled: z.boolean().optional(),
  ntpServer: z.boolean().optional(),
  ntpServers: z.array(z.string().trim().min(1).max(253)).max(16).optional(),
});

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = schema.parse(await req.json());
    await updateSettings(cfg, body);
    return { ok: true };
  });
}
