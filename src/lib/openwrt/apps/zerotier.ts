import type { AppSchema } from "../uci-schema";

/**
 * luci-app-zerotier — ZeroTier One virtual LAN client.
 *
 * Mirrors the official CBI model: a single named `sample_config` section with
 * the enable flag, the list of networks to join and the client-NAT flag, plus
 * a link to the vendor control panel (the official page's DummyValue button).
 */

export const zerotier: AppSchema = {
  slug: "zerotier",
  name: "ZeroTier",
  config: "zerotier",
  links: [{ label: "Zerotier.com", href: "https://my.zerotier.com/network" }],
  sections: [
    {
      type: "zerotier",
      named: "sample_config",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "join", kind: "dynamiclist", default: [] },
        { option: "nat", kind: "bool", default: false },
      ],
    },
  ],
};
