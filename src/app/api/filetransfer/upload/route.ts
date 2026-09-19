import { requireSession } from "@/lib/auth/session";
import { fail, mapError, ok } from "@/lib/api/respond";
import { saveUpload } from "@/lib/openwrt/filetransfer";

/**
 * Official upload handler: the multipart field is written verbatim into
 * `/tmp/upload/<name>` and the form reports `File saved to "/tmp/upload/…"`.
 */
export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const form = await req.formData();
    const file = form.get("ulfile") ?? form.get("file");
    if (!(file instanceof File) || file.name === "") {
      return fail(400, "validation", "No specify upload file.");
    }
    const data = Buffer.from(await file.arrayBuffer());
    const path = await saveUpload(cfg, file.name, data);
    return ok({ path });
  } catch (e) {
    return mapError(e);
  }
}
