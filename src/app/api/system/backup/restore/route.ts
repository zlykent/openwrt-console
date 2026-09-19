import { requireSession } from "@/lib/auth/session";
import { mapError, ok } from "@/lib/api/respond";
import { restoreBackup } from "@/lib/openwrt/backup";

/** Restore a previously downloaded configuration backup (multipart upload). */
export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: { kind: "validation", message: "Missing file" } }), { status: 400 });
    }
    const data = Buffer.from(await file.arrayBuffer());
    return ok(await restoreBackup(cfg, data));
  } catch (e) {
    return mapError(e);
  }
}
