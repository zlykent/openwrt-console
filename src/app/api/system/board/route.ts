import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getBoard } from "@/lib/openwrt/system";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getBoard(cfg);
  });
}
