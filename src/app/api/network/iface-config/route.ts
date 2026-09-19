import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import {
  createInterface,
  getIfaceConfigState,
  saveInterface,
} from "@/lib/openwrt/iface";

const ifaceSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_]+$/),
  proto: z.string(),
  auto: z.boolean(),
  device: z.string(),
  ipaddr: z.array(z.string()),
  netmask: z.string(),
  gateway: z.string(),
  dns: z.array(z.string()),
  peerdns: z.boolean(),
  metric: z.string(),
  mtu: z.string(),
  macaddr: z.string(),
  username: z.string(),
  password: z.string(),
  server: z.string(),
  privateKey: z.string(),
  addresses: z.array(z.string()),
  zone: z.string(),
});

const createSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_]+$/),
  proto: z.string(),
  zone: z.string(),
});

/** UCI-side interface configuration: read, update and create interfaces. */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getIfaceConfigState(cfg);
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = ifaceSchema.parse(await req.json());
    return await saveInterface(cfg, body);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = createSchema.parse(await req.json());
    return await createInterface(cfg, body);
  });
}
