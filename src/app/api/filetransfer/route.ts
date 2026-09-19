import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { fail, mapError, ok } from "@/lib/api/respond";
import { installUpload, listUploads, removeUpload } from "@/lib/openwrt/filetransfer";

/**
 * luci-app-filetransfer list + row actions (official Table section buttons
 * "Remove" and "Install", the latter only rendered for `.ipk` names).
 */
export async function GET() {
  try {
    const cfg = await requireSession();
    return ok({ files: await listUploads(cfg) });
  } catch (e) {
    return mapError(e);
  }
}

const actionSchema = z.object({
  action: z.enum(["remove", "install"]),
  name: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "validation", "Invalid request");
    const { action, name } = parsed.data;
    if (action === "remove") {
      await removeUpload(cfg, name);
      return ok({ removed: name });
    }
    const output = await installUpload(cfg, name);
    return ok({ output });
  } catch (e) {
    return mapError(e);
  }
}
