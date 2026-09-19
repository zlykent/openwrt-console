import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getFirewall, updateDefaults } from "@/lib/openwrt/firewall";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getFirewall(cfg);
  });
}

const policy = z.enum(["ACCEPT", "REJECT", "DROP"]);
const schema = z.object({
  input: policy.optional(),
  output: policy.optional(),
  forward: policy.optional(),
  synFlood: z.boolean().optional(),
  dropInvalid: z.boolean().optional(),
  fullcone: z.boolean().optional(),
  flowOffloading: z.boolean().optional(),
});

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = schema.parse(await req.json());
    return await updateDefaults(cfg, body);
  });
}
