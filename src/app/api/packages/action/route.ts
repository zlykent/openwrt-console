import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { installPackage, removePackage, updateLists } from "@/lib/openwrt/packages";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update") }),
  z.object({ action: z.literal("install"), name: z.string().min(1).max(128) }),
  z.object({ action: z.literal("remove"), name: z.string().min(1).max(128) }),
]);

/**
 * Package operations return the raw opkg output plus exit code so the UI can
 * show progress/errors. Names are re-validated inside the service layer.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = schema.parse(await req.json());
    if (body.action === "update") return await updateLists(cfg);
    if (body.action === "install") return await installPackage(cfg, body.name);
    return await removePackage(cfg, body.name);
  });
}
