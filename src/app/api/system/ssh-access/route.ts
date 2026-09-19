import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getDropbear, saveDropbear } from "@/lib/openwrt/dropbear";

const dropbearSchema = z.object({
  enable: z.boolean(),
  interface: z.string().max(32),
  port: z.string().max(8),
  passwordAuth: z.boolean(),
  rootPasswordAuth: z.boolean(),
  allowBlankPassword: z.boolean(),
  enableForwarding: z.boolean(),
  gatewayPorts: z.boolean(),
  maxAuthTries: z.string().max(8),
  idleTimeout: z.string().max(16),
  bannerFile: z.string().max(256),
});

const putSchema = z.object({ ref: z.string().optional(), dropbear: dropbearSchema });

/**
 * SSH server (dropbear) instances — the LuCI System → Administration →
 * SSH Access view. Reports the detected SSH `backend` (dropbear / openssh /
 * none); devices without dropbear return supported:false so the UI can explain
 * that OpenSSH-based builds manage SSH outside uci.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getDropbear(cfg);
  });
}

/** Create (no ref) or update (ref present) a uci `dropbear` instance. */
export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = putSchema.parse(await req.json());
    return await saveDropbear(cfg, body.ref, body.dropbear);
  });
}
