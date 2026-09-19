import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { deleteSection, setSectionEnabled } from "@/lib/openwrt/firewall";

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    const { enabled } = patchSchema.parse(await req.json());
    return await setSectionEnabled(cfg, ref, enabled);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  return handle(async () => {
    const cfg = await requireSession();
    const { ref } = await params;
    return await deleteSection(cfg, ref);
  });
}
