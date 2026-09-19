import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { addUpnpRule, getUpnp, saveUpnpConfig } from "@/lib/openwrt/upnp";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getUpnp(cfg);
  });
}

const ConfigSchema = z.object({
  enabled: z.boolean(),
  enableNatpmp: z.boolean(),
  enableUpnp: z.boolean(),
  secureMode: z.boolean(),
  logOutput: z.boolean(),
  download: z.string(),
  upload: z.string(),
  internalIface: z.string().min(1),
  port: z.string(),
});

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const input = ConfigSchema.parse(await req.json());
    return await saveUpnpConfig(cfg, input);
  });
}

const RuleSchema = z.object({
  action: z.enum(["allow", "deny"]).default("allow"),
  extPorts: z.string().min(1),
  intAddr: z.string().min(1),
  intPorts: z.string().min(1),
  comment: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const input = RuleSchema.parse(await req.json());
    return await addUpnpRule(cfg, input);
  });
}
