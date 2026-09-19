import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getActiveRoutes, getStaticRoutes, saveStaticRoute } from "@/lib/openwrt/routes";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    const [active, staticRoutes] = await Promise.all([getActiveRoutes(cfg), getStaticRoutes(cfg)]);
    return { active, static: staticRoutes };
  });
}

const RouteSchema = z.object({
  ref: z.string().optional(),
  kind: z.enum(["route", "route6"]).default("route"),
  name: z.string().optional(),
  iface: z.string().min(1),
  target: z.string().min(1),
  netmask: z.string().optional(),
  gateway: z.string().optional(),
  metric: z.string().optional(),
  mtu: z.string().optional(),
  type: z.string().optional(),
  enabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = RouteSchema.parse(await req.json());
    const { ref, ...input } = body;
    return await saveStaticRoute(cfg, input, ref);
  });
}
