import type { AppSchema } from "../uci-schema";

/**
 * luci-app-arpbind — "IP/MAC Binding" (static ARP rules).
 *
 * Mirrors the official CBI model (`model/cbi/arpbind.lua`): an add/remove-able
 * anonymous `arpbind` section per rule with IP, MAC and the interface the rule
 * applies to. The Lua page builds its widgets from the live system — the ARP
 * neighbours for both address fields (the MAC one labelled `mac (ip)`) and
 * `sys.net:devices()` minus `lo` for the interface ListValue, whose default is
 * `br-lan` — so those candidates are requested here as well.
 *
 * The official widgets render the addresses as `data-optional` and only the
 * interface as `rmempty = false`, which lets LuCI store a rule holding nothing
 * but an interface name. We still require all three on a newly added rule:
 * an address-less binding can never match a packet, and refusing it keeps the
 * device free of sections that only look like configuration.
 */
export const arpbind: AppSchema = {
  slug: "arpbind",
  name: "IP/MAC Binding",
  config: "arpbind",
  sections: [
    {
      type: "arpbind",
      multiple: true,
      fields: [
        { option: "ipaddr", kind: "ip", required: true, candidates: "neighbours" },
        { option: "macaddr", kind: "mac", required: true, candidates: "neighbours" },
        { option: "ifname", kind: "select", default: "br-lan", required: true, candidates: "devices" },
      ],
    },
  ],
};
