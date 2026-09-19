import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getFirewallRuleset } from "@/lib/openwrt/fwstatus";

/** Live firewall ruleset dump (Status → Firewall). */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getFirewallRuleset(cfg);
  });
}
