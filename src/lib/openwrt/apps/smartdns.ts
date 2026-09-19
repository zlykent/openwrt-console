import type { AppSchema } from "../uci-schema";

/**
 * luci-app-smartdns — local high-performance DNS server with fastest-IP
 * selection and ad filtering.
 *
 * Mirrors the official CBI model (`model/cbi/smartdns/smartdns.lua`): the
 * `smartdns` singleton split over two section cards (settings/second DNS/
 * custom, then domain address + IP blacklist), plus add/remove-able
 * `server` upstreams. Three fields are file-backed rather than UCI options.
 */

const SERVER_TYPES = ["udp", "tcp", "tls", "https"].map((v) => ({ value: v, label: v }));

export const smartdns: AppSchema = {
  slug: "smartdns",
  name: "SmartDNS",
  config: "smartdns",
  links: [
    { label: "SmartDNS", href: "https://github.com/pymumu/smartdns" },
    { label: "Donate", href: "https://github.com/pymumu/smartdns#donate" },
  ],
  sections: [
    {
      type: "smartdns",
      // Both this card and the last one wrap the same `smartdns` singleton, so
      // each needs its own label/key (official: "Settings" / "Advanced Settings").
      labelKey: "main",
      tabs: [
        {
          id: "settings",
          fields: [
            { option: "enabled", kind: "bool", default: false },
            { option: "server_name", kind: "text", default: "smartdns" },
            { option: "port", kind: "int", min: 1, max: 65535, default: "6053" },
            { option: "tcp_server", kind: "bool", default: true },
            { option: "ipv6_server", kind: "bool", default: true },
            { option: "dualstack_ip_selection", kind: "bool", default: false },
            { option: "prefetch_domain", kind: "bool", default: false },
            { option: "serve_expired", kind: "bool", default: false },
            {
              option: "redirect",
              kind: "select",
              default: "none",
              options: [
                { value: "none", label: "none" },
                { value: "dnsmasq-upstream", label: "Run as dnsmasq upstream server" },
                { value: "redirect", label: "Redirect 53 port to SmartDNS" },
              ],
            },
            { option: "cache_size", kind: "int", min: 0 },
            { option: "rr_ttl", kind: "int", min: 0 },
            { option: "rr_ttl_min", kind: "int", min: 0, default: "300" },
            { option: "rr_ttl_max", kind: "int", min: 0 },
          ],
        },
        {
          id: "seconddns",
          fields: [
            { option: "seconddns_enabled", kind: "bool", default: false },
            { option: "seconddns_port", kind: "int", min: 1, max: 65535, default: "6553" },
            { option: "seconddns_tcp_server", kind: "bool", default: true },
            { option: "seconddns_server_group", kind: "text" },
            { option: "seconddns_no_speed_check", kind: "bool", default: false },
            { option: "seconddns_no_rule_addr", kind: "bool", default: false },
            { option: "seconddns_no_rule_nameserver", kind: "bool", default: false },
            { option: "seconddns_no_rule_ipset", kind: "bool", default: false },
            { option: "seconddns_no_rule_soa", kind: "bool", default: false },
            { option: "seconddns_no_dualstack_selection", kind: "bool", default: false },
            { option: "seconddns_no_cache", kind: "bool", default: false },
            { option: "force_aaaa_soa", kind: "bool", default: false },
          ],
        },
        {
          id: "custom",
          fields: [
            {
              option: "custom_settings",
              kind: "textarea",
              file: "/etc/smartdns/custom.conf",
            },
            { option: "coredump", kind: "bool", default: false },
          ],
        },
      ],
    },
    {
      type: "server",
      multiple: true,
      titleOption: "name",
      fields: [
        { option: "enabled", kind: "bool", default: true },
        { option: "name", kind: "text" },
        { option: "ip", kind: "text" },
        { option: "port", kind: "int", min: 1, max: 65535 },
        { option: "type", kind: "select", options: SERVER_TYPES, default: "udp" },
      ],
    },
    {
      type: "smartdns",
      labelKey: "advanced",
      tabs: [
        {
          id: "domain-address",
          fields: [{ option: "address", kind: "textarea", file: "/etc/smartdns/address.conf" }],
        },
        {
          id: "blackip-list",
          fields: [
            { option: "blacklist_ip", kind: "textarea", file: "/etc/smartdns/blacklist-ip.conf" },
          ],
        },
      ],
    },
  ],
};
