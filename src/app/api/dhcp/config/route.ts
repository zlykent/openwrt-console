import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getAppConfig, saveAppConfig } from "@/lib/openwrt/apps-service";
import { coupleHostDns, DHCP_SCHEMA } from "@/lib/openwrt/dhcp-schema";
import type { SectionInstance } from "@/lib/openwrt/uci-schema";

const InstanceSchema = z.object({
  ref: z.string().nullable(),
  type: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])),
});

const SaveSchema = z.object({
  instances: z.array(InstanceSchema),
  restart: z.boolean().default(true),
});

/**
 * dnsmasq server settings, static leases and custom domains.
 *
 * Writes go through the shared schema engine, so the only sections a request
 * can touch are the ones `DHCP_SCHEMA` declares (`dnsmasq`, `host`, `domain`):
 * the per-interface `dhcp`, `odhcpd` and `srvhost` sections in the same file are
 * out of reach by construction, and there is no free-form section reference to
 * smuggle one in through.
 */
export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getAppConfig(cfg, DHCP_SCHEMA);
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const input = SaveSchema.parse(await req.json());
    // The lease hostname owns the `dns` option (CBI write hook), so it is
    // derived here rather than trusted from the form.
    return await saveAppConfig(
      cfg,
      DHCP_SCHEMA,
      coupleHostDns(input.instances as SectionInstance[]),
      input.restart,
    );
  });
}
