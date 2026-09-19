import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getLedConfig, saveLed } from "@/lib/openwrt/leds";

const ledSchema = z.object({
  name: z.string(),
  sysfs: z.string(),
  trigger: z.string(),
  dev: z.string(),
  mode: z.string(),
  delayon: z.string(),
  delayoff: z.string(),
  default: z.boolean(),
});

const putSchema = z.object({ ref: z.string().optional(), led: ledSchema });

/**
 * LED configuration. LEDs are exposed under /sys/class/leds and configured
 * via uci `system` led sections. Devices without LEDs report supported:false.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getLedConfig(cfg);
  });
}

/** Create (no ref) or update (ref present) a uci `system` led section. */
export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = putSchema.parse(await req.json());
    return await saveLed(cfg, body.ref, body.led);
  });
}
