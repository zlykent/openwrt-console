import { requireSession } from "@/lib/auth/session";
import { mapError, ok } from "@/lib/api/respond";
import { flashFirmware } from "@/lib/openwrt/backup";

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

/**
 * Upload a firmware image and flash it via sysupgrade. The device reboots;
 * `keepConfig` (form field, default true) preserves /etc across the flash.
 */
export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: { kind: "validation", message: "Missing file" } }), { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: { kind: "validation", message: "Image too large" } }), { status: 400 });
    }
    const keep = form.get("keepConfig") !== "0";
    const data = Buffer.from(await file.arrayBuffer());
    return ok(await flashFirmware(cfg, data, keep));
  } catch (e) {
    return mapError(e);
  }
}
