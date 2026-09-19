import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { deleteInterface } from "@/lib/openwrt/iface";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { name } = await params;
    return await deleteInterface(cfg, name);
  });
}
