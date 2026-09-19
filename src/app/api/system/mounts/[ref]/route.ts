import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { deleteFstabSection } from "@/lib/openwrt/mounts";

/**
 * Deletion only: creating and updating go through POST /api/system/mounts,
 * which carries the section reference in the body instead of the URL (the
 * reference is `@mount[0]`, which needs escaping in a path).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    return await deleteFstabSection(cfg, ref);
  });
}
