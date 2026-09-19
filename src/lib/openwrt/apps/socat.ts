import type { AppSchema } from "../uci-schema";

/**
 * luci-app-socat — "Socat" port forwarder.
 *
 * Mirrors the official CBI models (`socat/index.lua` list + `socat/config.lua`
 * editor): the named `global` enable flag and the add/remove-able `config`
 * sections (one per port forward). The official editor is a separate page per
 * instance; here every instance is edited inline with the same fields.
 */

const FAMILIES = [
  { value: "", label: "IPv4 and IPv6" },
  { value: "4", label: "IPv4 only" },
  { value: "6", label: "IPv6 only" },
];

const PROTOS = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
];

const DEST_PROTOS = [
  { value: "tcp4", label: "IPv4-TCP" },
  { value: "udp4", label: "IPv4-UDP" },
  { value: "tcp6", label: "IPv6-TCP" },
  { value: "udp6", label: "IPv6-UDP" },
];

export const socat: AppSchema = {
  slug: "socat",
  name: "Socat",
  config: "socat",
  service: "luci_socat",
  sections: [
    {
      type: "global",
      named: "global",
      fields: [{ option: "enable", kind: "bool", default: false }],
    },
    {
      type: "config",
      multiple: true,
      titleOption: "remarks",
      fields: [
        { option: "enable", kind: "bool", default: true },
        { option: "remarks", kind: "text", required: true },
        { option: "protocol", kind: "select", options: [{ value: "port_forwards", label: "Port Forwards" }], default: "port_forwards" },
        { option: "family", kind: "select", options: FAMILIES, default: "" },
        { option: "proto", kind: "select", options: PROTOS, default: "tcp" },
        { option: "listen_port", kind: "text", required: true },
        { option: "reuseaddr", kind: "bool", default: true },
        { option: "dest_proto", kind: "select", options: DEST_PROTOS, default: "tcp4" },
        { option: "dest_ip", kind: "ip", required: true },
        { option: "dest_port", kind: "text", required: true },
        { option: "firewall_accept", kind: "bool", default: true },
      ],
    },
  ],
};
