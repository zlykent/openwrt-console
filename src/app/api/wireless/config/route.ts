import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import {
  createWifiIface,
  getWirelessConfig,
  saveRadio,
  saveWifiIface,
} from "@/lib/openwrt/wireless";

const radioSchema = z.object({
  name: z.string(),
  channel: z.string(),
  country: z.string(),
  htmode: z.string(),
  txpower: z.string(),
  disabled: z.boolean(),
});

const ifaceSchema = z.object({
  ref: z.string(),
  device: z.string(),
  ssid: z.string(),
  mode: z.string(),
  encryption: z.string(),
  key: z.string(),
  networks: z.array(z.string()),
  hidden: z.boolean(),
  disabled: z.boolean(),
});

const putSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("radio"), radio: radioSchema }),
  z.object({ kind: z.literal("iface"), iface: ifaceSchema }),
]);

const postSchema = z.object({
  device: z.string().min(1),
  ssid: z.string().min(1),
  network: z.string(),
});

/** UCI-side wireless configuration: radios, wifi-ifaces and creation. */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getWirelessConfig(cfg);
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = putSchema.parse(await req.json());
    return body.kind === "radio"
      ? await saveRadio(cfg, body.radio)
      : await saveWifiIface(cfg, body.iface);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = postSchema.parse(await req.json());
    return await createWifiIface(cfg, body);
  });
}
