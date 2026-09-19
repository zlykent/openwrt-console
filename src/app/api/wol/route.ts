import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getWol, wakeHost } from "@/lib/openwrt/wol";

const wakeSchema = z.object({
  /** One of the two official utilities; omitted means "auto" (etherwake first). */
  binary: z.string().max(64).optional(),
  /** Empty string = broadcast on all interfaces. */
  iface: z.string().max(32).optional(),
  mac: z.string().min(1).max(64),
});

/**
 * luci-app-wol. GET returns the form state (available utilities, devices and
 * MAC hints); POST sends the magic packet and echoes the utility output,
 * exactly like the official SimpleForm submit.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getWol(cfg);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = wakeSchema.parse(await req.json());
    return await wakeHost(cfg, body);
  });
}
