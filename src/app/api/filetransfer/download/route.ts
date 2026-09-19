import { requireSession } from "@/lib/auth/session";
import { fail, mapError } from "@/lib/api/respond";
import { fetchDownload } from "@/lib/openwrt/filetransfer";

/**
 * Official `Download()` action: streams the requested entry of
 * `/tmp/upload/` as an attachment (directories arrive as `.tar.gz`).
 */
export async function GET(req: Request) {
  try {
    const cfg = await requireSession();
    const name = new URL(req.url).searchParams.get("name") ?? "";
    if (!name) return fail(400, "validation", "Missing file name");
    const { data, filename } = await fetchDownload(cfg, name);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return mapError(e);
  }
}
