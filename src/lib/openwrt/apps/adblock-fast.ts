import type { AppSchema } from "../uci-schema";

/**
 * luci-app-adblock-fast — fast ad/tracker blocker.
 * Fields follow the official OpenWrt UCI defaults for /etc/config/adblock-fast.
 * TODO(verify): confirm every option against live `uci show adblock-fast` /
 * the official luci-app-adblock-fast view.js once a device is reachable.
 */

const DNS_BACKENDS = [
  { value: "dnsmasq.servers", label: "dnsmasq (servers)" },
  { value: "dnsmasq.conf", label: "dnsmasq (conf)" },
  { value: "dnsmasq.ipset", label: "dnsmasq (ipset)" },
  { value: "dnsmasq.nftset", label: "dnsmasq (nftset)" },
  { value: "unbound", label: "unbound" },
];

export const adblockFast: AppSchema = {
  slug: "adblock-fast",
  name: "Adblock Fast",
  config: "adblock-fast",
  service: "adblock-fast",
  sections: [
    {
      type: "adblock-fast",
      named: "config",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "enabled", kind: "bool", default: true },
            { option: "verbosity", kind: "select", default: "2", options: [
              { value: "0", label: "0" }, { value: "1", label: "1" }, { value: "2", label: "2" },
            ] },
            { option: "force_dns", kind: "bool", default: true },
            { option: "force_dns_port", kind: "dynamiclist", default: ["53"] },
            { option: "dns_backend", kind: "select", default: "dnsmasq.servers", options: DNS_BACKENDS },
            { option: "allow_local_net", kind: "bool", default: false },
            { option: "debug", kind: "bool", default: false },
          ],
        },
        {
          id: "lists",
          fields: [
            { option: "allowed_domain_list_urls", kind: "dynamiclist" },
            { option: "blocked_domain_list_urls", kind: "dynamiclist" },
            { option: "allowed_host_list_urls", kind: "dynamiclist" },
            { option: "blocked_host_list_urls", kind: "dynamiclist" },
          ],
        },
        {
          id: "advanced",
          fields: [
            { option: "curl_timeout", kind: "int", default: "5" },
            { option: "curl_retry", kind: "int", default: "3" },
            { option: "parallel_downloads", kind: "bool", default: true },
            { option: "procd_boot_delay", kind: "int", default: "0" },
            { option: "procd_reload_delay", kind: "int", default: "1" },
          ],
        },
      ],
    },
  ],
};
