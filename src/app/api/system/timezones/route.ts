import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getTimezones } from "@/lib/openwrt/system";

/**
 * The device's own zone table, so the Timezone field offers what this build
 * actually knows and the POSIX `timezone` string can be derived from the same
 * source LuCI uses. Empty on a build without Lua LuCI — the page then keeps the
 * free-text fields rather than inventing a list.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getTimezones(cfg);
  });
}
