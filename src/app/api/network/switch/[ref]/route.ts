import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { deleteSwitchVlan } from "@/lib/openwrt/switch";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    return await deleteSwitchVlan(cfg, ref);
  });
}
