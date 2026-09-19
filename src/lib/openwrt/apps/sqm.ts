import type { AppSchema } from "../uci-schema";

/**
 * luci-app-sqm — Smart Queue Management traffic shaping.
 * Fields mirror the official JS view (applications/luci-app-sqm,
 * view/network/sqm.js): anonymous, add/remove-able `queue` sections
 * with the three official tabs.
 */

const ON_OFF = [
  { value: "1", label: "1" },
  { value: "0", label: "0" },
];

export const sqm: AppSchema = {
  slug: "sqm",
  name: "Smart Queue Management",
  config: "sqm",
  sections: [
    {
      type: "queue",
      multiple: true,
      titleOption: "interface",
      tabs: [
        {
          id: "tab_basic",
          fields: [
            { option: "enabled", kind: "bool", default: false },
            { option: "interface", kind: "text", required: true },
            { option: "download", kind: "int", min: 0, required: true },
            { option: "upload", kind: "int", min: 0, required: true },
            { option: "debug_logging", kind: "bool", default: false },
            {
              option: "verbosity",
              kind: "select",
              default: "5",
              options: [
                { value: "0", label: "silent" },
                { value: "1", label: "error" },
                { value: "2", label: "warning" },
                { value: "5", label: "info (default)" },
                { value: "8", label: "debug" },
                { value: "10", label: "trace" },
              ],
            },
          ],
        },
        {
          id: "tab_qdisc",
          fields: [
            // Official list is device-derived; free text keeps unknown qdiscs editable.
            { option: "qdisc", kind: "text", default: "cake", required: true },
            { option: "script", kind: "text", default: "piece_of_cake.qos", required: true },
            { option: "qdisc_advanced", kind: "bool", default: false },
            { option: "use_mq", kind: "bool", default: false, depends: { option: "qdisc_advanced", values: ["1"] } },
            { option: "squash_dscp", kind: "select", default: "1", options: ON_OFF, depends: { option: "qdisc_advanced", values: ["1"] } },
            { option: "squash_ingress", kind: "select", default: "1", options: ON_OFF, depends: { option: "qdisc_advanced", values: ["1"] } },
            {
              option: "ingress_ecn",
              kind: "select",
              default: "ECN",
              options: [{ value: "ECN", label: "ECN (default)" }, { value: "NOECN", label: "NOECN" }],
              depends: { option: "qdisc_advanced", values: ["1"] },
            },
            {
              option: "egress_ecn",
              kind: "select",
              default: "NOECN",
              options: [{ value: "NOECN", label: "NOECN (default)" }, { value: "ECN", label: "ECN" }],
              depends: { option: "qdisc_advanced", values: ["1"] },
            },
            { option: "qdisc_really_really_advanced", kind: "bool", default: false, depends: { option: "qdisc_advanced", values: ["1"] } },
            { option: "ilimit", kind: "int", min: 0, depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
            { option: "elimit", kind: "int", min: 0, depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
            { option: "itarget", kind: "text", depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
            { option: "etarget", kind: "text", depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
            { option: "iqdisc_opts", kind: "text", depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
            { option: "eqdisc_opts", kind: "text", depends: { option: "qdisc_really_really_advanced", values: ["1"] } },
          ],
        },
        {
          id: "tab_linklayer",
          fields: [
            {
              option: "linklayer",
              kind: "select",
              default: "none",
              options: [
                { value: "none", label: "none (default)" },
                { value: "ethernet", label: "Ethernet with overhead" },
                { value: "atm", label: "ATM" },
              ],
            },
            { option: "overhead", kind: "int", min: -1500, default: "0", depends: { option: "linklayer", values: ["ethernet", "atm"] } },
            { option: "linklayer_advanced", kind: "bool", default: false, depends: { option: "linklayer", values: ["ethernet", "atm"] } },
            { option: "tcMTU", kind: "int", min: 0, default: "2047", depends: { option: "linklayer_advanced", values: ["1"] } },
            { option: "tcTSIZE", kind: "int", min: 0, default: "128", depends: { option: "linklayer_advanced", values: ["1"] } },
            { option: "tcMPU", kind: "int", min: 0, default: "0", depends: { option: "linklayer_advanced", values: ["1"] } },
            {
              option: "linklayer_adaptation_mechanism",
              kind: "select",
              default: "default",
              options: [
                { value: "default", label: "default (default)" },
                { value: "cake", label: "cake" },
                { value: "htb_private", label: "htb_private" },
                { value: "tc_stab", label: "tc_stab" },
              ],
              depends: { option: "linklayer_advanced", values: ["1"] },
            },
          ],
        },
      ],
    },
  ],
};
