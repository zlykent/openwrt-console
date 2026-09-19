import type { AppSchema } from "../uci-schema";

/**
 * luci-app-turboacc — "Turbo ACC Acceleration Settings".
 *
 * Mirrors the official CBI model: one anonymous `turboacc` section with the
 * offloading / BBR / FullCone NAT flags and the DNS caching trio. The official
 * page hides choices whose kernel module is absent; all options are offered
 * here and the device simply ignores unsupported ones.
 */

const DNS_PROGRAMS = [
  { value: "1", label: "Using PDNSD to query and cache" },
  { value: "2", label: "Using DNSForwarder to query and cache" },
  { value: "3", label: "Using DNSProxy to query and cache" },
];

const DNS_CACHING_ON = { option: "dns_caching", values: ["1"] };

export const turboacc: AppSchema = {
  slug: "turboacc",
  name: "Turbo ACC",
  config: "turboacc",
  sections: [
    {
      type: "turboacc",
      fields: [
        { option: "sw_flow", kind: "bool", default: false },
        { option: "hw_flow", kind: "bool", default: false },
        { option: "sfe_flow", kind: "bool", default: false },
        { option: "bbr_cca", kind: "bool", default: false },
        { option: "fullcone_nat", kind: "bool", default: false },
        { option: "dns_caching", kind: "bool", default: false },
        {
          option: "dns_caching_mode",
          kind: "select",
          options: DNS_PROGRAMS,
          default: "1",
          depends: DNS_CACHING_ON,
        },
        {
          option: "dns_caching_dns",
          kind: "text",
          default:
            "114.114.114.114,114.114.115.115,223.5.5.5,223.6.6.6,180.76.76.76,119.29.29.29,119.28.28.28,1.2.4.8,210.2.4.8",
          depends: DNS_CACHING_ON,
        },
      ],
    },
  ],
};
