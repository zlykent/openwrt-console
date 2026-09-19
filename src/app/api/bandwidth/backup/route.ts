import { requireSession } from "@/lib/auth/session";
import { fail, mapError, ok } from "@/lib/api/respond";
import { downloadNlbwBackup, restoreNlbwBackup } from "@/lib/openwrt/nlbwmon";

/**
 * Mirrors the official `admin/nlbw/download` (GET) and `admin/nlbw/restore`
 * (POST, multipart field `archive`) actions of luci-app-nlbwmon.
 */
export async function GET() {
  try {
    const cfg = await requireSession();
    const backup = await downloadNlbwBackup(cfg);
    const bytes = Uint8Array.from(Buffer.from(backup.base64, "base64"));
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
      },
    });
  } catch (e) {
    return mapError(e);
  }
}

export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const form = await req.formData();
    const file = form.get("archive") ?? form.get("file");
    if (!(file instanceof File)) {
      return fail(400, "validation", "Missing archive");
    }
    const data = Buffer.from(await file.arrayBuffer());
    const files = await restoreNlbwBackup(cfg, data);
    return ok({ files });
  } catch (e) {
    return mapError(e);
  }
}
