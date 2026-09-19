import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getSwitchConfig, saveSwitchVlan } from "@/lib/openwrt/switch";

const vlanSchema = z.object({
  device: z.string().trim().min(1).max(64),
  vlan: z.string().trim().min(1).max(16),
  ports: z.array(z.string().trim().min(1).max(64)).max(128),
});

const putSchema = z.object({ ref: z.string().optional(), vlan: vlanSchema });

/**
 * Switch / VLAN configuration. Detects the active backend — legacy swconfig
 * (`switch_vlan`) or modern DSA (`bridge-vlan`) — and returns the VLAN table.
 * Devices with no hardware switch and no bridge VLANs report supported:false.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getSwitchConfig(cfg);
  });
}

/** Create (no ref) or update (ref present) a VLAN section. */
export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = putSchema.parse(await req.json());
    return await saveSwitchVlan(cfg, body.ref, body.vlan);
  });
}
