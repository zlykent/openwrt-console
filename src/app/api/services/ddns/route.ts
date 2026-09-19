import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getDdns, getDdnsProviders, saveDdnsService } from "@/lib/openwrt/ddns";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    const [config, providers] = await Promise.all([getDdns(cfg), getDdnsProviders(cfg)]);
    return { ...config, providers };
  });
}

const ServiceSchema = z.object({
  ref: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  serviceName: z.string().optional(),
  lookupHost: z.string().optional(),
  domain: z.string().optional(),
  updateUrl: z.string().optional(),
  username: z.string().optional(),
  checkInterval: z.string().optional(),
  forceInterval: z.string().optional(),
  ipSource: z.string().optional(),
  useIpv6: z.boolean().default(false),
});

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = ServiceSchema.parse(await req.json());
    const { ref, ...input } = body;
    return await saveDdnsService(cfg, input, ref);
  });
}
