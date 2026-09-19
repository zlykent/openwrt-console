import type { AppSchema, SectionInstance } from "./uci-schema";

/**
 * `/etc/config/dhcp` — LuCI's "DHCP and DNS" page.
 *
 * The target device runs the Lua CBI model, so this mirrors
 * `/usr/lib/lua/luci/model/cbi/admin_network/dhcp.lua` (luci-base
 * git-22.211.60098) option for option, tab for tab:
 *
 * - a singleton `dnsmasq` section split over the four official tabs
 *   (general / files / tftp / advanced),
 * - `host` sections = "Static Leases", anonymous and add/remove-able,
 * - `domain` sections = "Custom domain", the same rows the separate
 *   `hosts.lua` page ("Hostnames") edits.
 *
 * Deliberately absent: the two DNSSEC flags, which the Lua model only declares
 * when `luci.util.checklib("/usr/sbin/dnsmasq", "libhogweed.so")` succeeds — the
 * device's dnsmasq is built `no-DNSSEC` and its init script *aborts* when a
 * `dnssec*` option is requested without support. Also absent: the `dhcp`,
 * `odhcpd` and `srvhost` sections, which belong to the interface editor and to
 * other apps — leaving them out of the schema is what keeps a save here from
 * touching them at all. The same goes for options no model declares (the
 * device's legacy `localuse`): what the schema does not read, it does not write.
 *
 * Flag defaults follow `/etc/init.d/dnsmasq` rather than the CBI template:
 * `nonwildcard`, `rebind_protection` and `boguspriv` are read there as
 * `config_get_bool … 1` / `append_bool … 1`, so an absent option means
 * *enabled* and the form has to say so. The Lua model declares no default for
 * the first two, which renders them unchecked on a stock config — and its first
 * save then writes an explicit `0`, dropping rebind protection without anyone
 * asking for it. Unchecking a flag here writes a real `0` instead of deleting
 * the option, so what the form shows is what the daemon gets.
 *
 * Labels live in the `apps.dhcp.*` i18n namespace (`.s` sections, `.t` tabs,
 * `.f` fields, `.o` option values) even though DHCP is a first-class page rather
 * than a luci-app: the shared `UciForm` renderer resolves them from the schema
 * slug and has no other namespace to look in.
 */
export const DHCP_SCHEMA: AppSchema = {
  slug: "dhcp",
  name: "DHCP and DNS",
  config: "dhcp",
  service: "dnsmasq",
  sections: [
    {
      type: "dnsmasq",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "domainneeded", kind: "bool" },
            { option: "authoritative", kind: "bool" },
            // Plain Values in the model: the device stores `local '/lan/'`,
            // which no hostname datatype would accept.
            { option: "local", kind: "text" },
            { option: "domain", kind: "text" },
            { option: "logqueries", kind: "bool" },
            { option: "server", kind: "dynamiclist", placeholder: "/example.org/10.1.2.3" },
            { option: "rebind_protection", kind: "bool", default: true },
            {
              option: "rebind_localhost",
              kind: "bool",
              depends: { option: "rebind_protection", values: ["1"] },
            },
            {
              option: "rebind_domain",
              kind: "dynamiclist",
              itemKind: "host4",
              placeholder: "ihost.netflix.com",
              depends: { option: "rebind_protection", values: ["1"] },
            },
            { option: "localservice", kind: "bool" },
            { option: "nonwildcard", kind: "bool", default: true },
            {
              option: "interface",
              kind: "dynamiclist",
              depends: { option: "nonwildcard", values: ["1"] },
            },
            {
              option: "notinterface",
              kind: "dynamiclist",
              depends: { option: "nonwildcard", values: ["1"] },
            },
          ],
        },
        {
          id: "files",
          fields: [
            { option: "readethers", kind: "bool" },
            { option: "leasefile", kind: "text" },
            { option: "noresolv", kind: "bool" },
            // `rf:depends("noresolv", "")` — shown while the flag is unchecked.
            { option: "resolvfile", kind: "text", depends: { option: "noresolv", values: ["0", ""] } },
            { option: "nohosts", kind: "bool" },
            { option: "addnhosts", kind: "dynamiclist" },
          ],
        },
        {
          id: "tftp",
          fields: [
            { option: "enable_tftp", kind: "bool" },
            { option: "tftp_root", kind: "text", placeholder: "/", depends: { option: "enable_tftp", values: ["1"] } },
            {
              option: "dhcp_boot",
              kind: "text",
              placeholder: "pxelinux.0",
              depends: { option: "enable_tftp", values: ["1"] },
            },
          ],
        },
        {
          id: "advanced",
          fields: [
            { option: "filter_aaaa", kind: "bool" },
            { option: "filter_https", kind: "bool" },
            { option: "filter_unknown", kind: "bool" },
            { option: "quietdhcp", kind: "bool" },
            { option: "sequential_ip", kind: "bool" },
            { option: "boguspriv", kind: "bool", default: true },
            { option: "filterwin2k", kind: "bool" },
            { option: "localise_queries", kind: "bool" },
            { option: "expandhosts", kind: "bool" },
            { option: "nonegcache", kind: "bool" },
            { option: "allservers", kind: "bool" },
            { option: "serversfile", kind: "text" },
            { option: "strictorder", kind: "bool" },
            { option: "bogusnxdomain", kind: "dynamiclist", placeholder: "67.215.65.132" },
            { option: "port", kind: "int", min: 0, max: 65535, placeholder: "53" },
            { option: "queryport", kind: "int", min: 0, max: 65535 },
            { option: "dhcpleasemax", kind: "int", min: 0 },
            { option: "ednspacket_max", kind: "int", min: 0, placeholder: "1280" },
            { option: "dnsforwardmax", kind: "int", min: 0, placeholder: "150" },
            { option: "cachesize", kind: "int", min: 0, max: 10000, placeholder: "150" },
            { option: "mini_ttl", kind: "int", min: 0, max: 86400, placeholder: "0" },
          ],
        },
      ],
    },
    {
      type: "host",
      multiple: true,
      titleOption: "name",
      // `ip.validate` in the model: an address alone identifies nobody.
      rules: [{ when: "ip", atLeastOne: ["name", "mac"] }],
      fields: [
        { option: "name", kind: "hostname" },
        // `datatype = "list(macaddr)"` on a Value widget: one option holding
        // space-separated addresses, suggested from the ARP table as `mac (ip)`.
        { option: "mac", kind: "text", itemKind: "mac", candidates: "neighbours" },
        { option: "ip", kind: "ip", allowValues: ["ignore"], candidates: "neighbours" },
        { option: "leasetime", kind: "text", placeholder: "12h" },
        { option: "hostid", kind: "text" },
        // Written by the model's `name.write` / `name.remove` hooks, never by a
        // widget: dnsmasq only publishes the lease hostname in DNS when it is 1.
        { option: "dns", kind: "text", hidden: true },
      ],
    },
    {
      type: "domain",
      multiple: true,
      titleOption: "name",
      fields: [
        { option: "name", kind: "hostname", labelKey: "domain_name" },
        // The Lua `dhcp.lua` offers no candidates here, but the sibling
        // `hosts.lua` page edits the very same sections with the ARP table as
        // suggestions, so they are offered for both.
        { option: "ip", kind: "ip", allowValues: ["ignore"], candidates: "neighbours", labelKey: "domain_ip" },
        { option: "comments", kind: "text" },
      ],
    },
  ],
};

/**
 * Reproduce the CBI write hooks of the static-lease hostname:
 * `name.write` also sets `dns=1`, `name.remove` deletes it again. Without that
 * coupling `/etc/init.d/dnsmasq` skips the `echo "$ip $name" >> $HOSTFILE_TMP`
 * branch and a lease's hostname never resolves, no matter what the UI shows.
 *
 * The value is written as text rather than as a bool so that clearing the
 * hostname deletes the option instead of leaving a stray `dns '0'` behind.
 */
export function coupleHostDns(instances: SectionInstance[]): SectionInstance[] {
  return instances.map((inst) => {
    if (inst.type !== "host") return inst;
    const name = typeof inst.values.name === "string" ? inst.values.name.trim() : "";
    return { ...inst, values: { ...inst.values, dns: name === "" ? "" : "1" } };
  });
}
