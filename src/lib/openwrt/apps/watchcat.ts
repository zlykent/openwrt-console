import type { AppSchema } from "../uci-schema";

/**
 * luci-app-watchcat — reboot/restart/script actions on unreachable hosts.
 * Fields mirror the official JS view (applications/luci-app-watchcat,
 * view/watchcat.js): anonymous, add/remove-able `watchcat` rule sections.
 */

const PING_MODES = ["ping_reboot", "restart_iface", "run_script"];

export const watchcat: AppSchema = {
  slug: "watchcat",
  name: "Watchcat",
  config: "watchcat",
  sections: [
    {
      type: "watchcat",
      multiple: true,
      titleOption: "_ref",
      fields: [
        {
          option: "mode",
          kind: "select",
          options: [
            { value: "ping_reboot", label: "Ping Reboot" },
            { value: "periodic_reboot", label: "Periodic Reboot" },
            { value: "restart_iface", label: "Restart Interface" },
            { value: "run_script", label: "Run Script" },
          ],
        },
        {
          option: "script",
          kind: "text",
          default: "/etc/watchcat.user.sh",
          depends: { option: "mode", values: ["run_script"] },
        },
        { option: "period", kind: "text", default: "6h" },
        {
          option: "pinghosts",
          kind: "dynamiclist",
          default: ["8.8.8.8", "1.1.1.1"],
          depends: { option: "mode", values: PING_MODES },
        },
        {
          option: "addressfamily",
          kind: "select",
          default: "any",
          options: [
            { value: "any", label: "Any" },
            { value: "ipv4", label: "ipv4" },
            { value: "ipv6", label: "ipv6" },
          ],
          depends: { option: "mode", values: PING_MODES },
        },
        { option: "pingperiod", kind: "text", default: "30s", depends: { option: "mode", values: PING_MODES } },
        {
          option: "pingsize",
          kind: "select",
          default: "standard",
          options: [
            { value: "small", label: "Small: 1 byte" },
            { value: "windows", label: "Windows: 32 bytes" },
            { value: "standard", label: "Standard: 56 bytes" },
            { value: "big", label: "Big: 248 bytes" },
            { value: "huge", label: "Huge: 1492 bytes" },
            { value: "jumbo", label: "Jumbo: 9000 bytes" },
          ],
          depends: { option: "mode", values: PING_MODES },
        },
        {
          option: "forcedelay",
          kind: "text",
          default: "1m",
          depends: { option: "mode", values: ["ping_reboot", "periodic_reboot"] },
        },
        { option: "interface", kind: "text", depends: { option: "mode", values: PING_MODES } },
        { option: "mmifacename", kind: "text", depends: { option: "mode", values: ["restart_iface"] } },
        { option: "unlockbands", kind: "bool", default: false, depends: { option: "mode", values: ["restart_iface"] } },
      ],
    },
  ],
};
