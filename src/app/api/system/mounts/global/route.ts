import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { saveGlobal } from "@/lib/openwrt/mounts";

/**
 * The five flags LuCI exposes from `config global`. `delay_root` lives in the
 * same section but LuCI does not offer it, so it is neither read nor written
 * here and survives every save untouched.
 */
const GlobalSchema = z.object({
  anonSwap: z.boolean().optional(),
  anonMount: z.boolean().optional(),
  autoSwap: z.boolean().optional(),
  autoMount: z.boolean().optional(),
  checkFs: z.boolean().optional(),
});

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = GlobalSchema.parse(await req.json());
    return await saveGlobal(cfg, body);
  });
}
