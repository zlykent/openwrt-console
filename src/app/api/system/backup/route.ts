import { requireSession } from "@/lib/auth/session";
import { handle, mapError } from "@/lib/api/respond";
import { createBackup, listBackupFiles } from "@/lib/openwrt/backup";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    const files = await listBackupFiles(cfg);
    return { files };
  });
}

/** Generate a configuration backup on the device and stream it to the client. */
export async function POST() {
  try {
    const cfg = await requireSession();
    const data = await createBackup(cfg);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": 'attachment; filename="openwrt-backup.tar.gz"',
      },
    });
  } catch (e) {
    return mapError(e);
  }
}
