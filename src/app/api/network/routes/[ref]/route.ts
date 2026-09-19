import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { deleteStaticRoute, saveStaticRoute } from "@/lib/openwrt/routes";

const UpdateSchema = z.object({
  kind: z.enum(["route", "route6"]).default("route"),
  name: z.string().optional(),
  iface: z.string().min(1),
  target: z.string().min(1),
  netmask: z.string().optional(),
  gateway: z.string().optional(),
  metric: z.string().optional(),
  enabled: z.boolean().default(true),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    const input = UpdateSchema.parse(await req.json());
    return await saveStaticRoute(cfg, input, ref);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    return await deleteStaticRoute(cfg, ref);
  });
}
