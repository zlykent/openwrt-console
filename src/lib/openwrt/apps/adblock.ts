import type { AppSchema } from "../uci-schema";

/**
 * luci-app-adblock — network-wide ad/tracker blocker (dnsmasq/unbound backend).
 * Fields follow the official OpenWrt UCI defaults for the `global` section of
 * /etc/config/adblock. The per-source blocklist sections are intentionally not
 * modelled yet.
 * TODO(verify): confirm options + add `source` sections against live
 * `uci show adblock` / official view.js once a device is reachable.
 */

export const adblock: AppSchema = {
  slug: "adblock",
  name: "Adblock",
  config: "adblock",
  service: "adblock",
  sections: [
    {
      type: "adblock",
      named: "global",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "adb_enabled", kind: "bool", default: false },
            { option: "adb_forcedns", kind: "bool", default: true },
            { option: "adb_dns", kind: "select", default: "dnsmasq", options: [
              { value: "dnsmasq", label: "dnsmasq" },
              { value: "unbound", label: "unbound" },
              { value: "nftset", label: "nftset" },
            ] },
            { option: "adb_trigger", kind: "dynamiclist" },
            { option: "adb_fetchutil", kind: "select", options: [
              { value: "", label: "auto" },
              { value: "curl", label: "curl" },
              { value: "wget", label: "wget" },
              { value: "uclient-fetch", label: "uclient-fetch" },
            ] },
          ],
        },
        {
          id: "advanced",
          fields: [
            { option: "adb_safesearch", kind: "bool", default: false },
            { option: "adb_safesearchlist", kind: "select", default: "default", options: [
              { value: "default", label: "default" },
              { value: "all", label: "all" },
              { value: "none", label: "none" },
            ] },
            { option: "adb_report", kind: "bool", default: false },
            { option: "adb_debug", kind: "bool", default: false },
            { option: "adb_mail", kind: "bool", default: false },
            { option: "adb_mailprofile", kind: "text", default: "msmtp" },
            { option: "adb_mailreceiver", kind: "text" },
          ],
        },
      ],
    },
  ],
};
