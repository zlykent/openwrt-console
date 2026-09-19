import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { applyFstab, detectFstab, umountTarget } from "@/lib/openwrt/mounts";

const ActionSchema = z.discriminatedUnion("action", [
  // `/sbin/block mount`, what ucitrack runs for fstab on LuCI's Save & Apply.
  z.object({ action: z.literal("apply") }),
  // LuCI's "Generate Config": replaces /etc/config/fstab with detected devices.
  z.object({ action: z.literal("detect") }),
  z.object({ action: z.literal("umount"), target: z.string().min(1) }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = ActionSchema.parse(await req.json());
    if (body.action === "apply") return await applyFstab(cfg);
    if (body.action === "detect") return await detectFstab(cfg);
    return await umountTarget(cfg, body.target);
  });
}
