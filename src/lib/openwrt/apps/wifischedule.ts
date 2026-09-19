import type { AppSchema } from "../uci-schema";

/**
 * luci-app-wifischedule — scheduled Wi-Fi on/off.
 * Fields mirror the official JS view (applications/luci-app-wifischedule,
 * view/wifischedule/wifischedule.js): singleton `global` section plus
 * add/remove-able `entry` schedule events.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
  (d) => ({ value: d, label: d }),
);

export const wifischedule: AppSchema = {
  slug: "wifischedule",
  name: "Wifi Schedule",
  config: "wifi_schedule",
  service: "wifi_schedule",
  sections: [
    {
      type: "global",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "logging", kind: "bool", default: false },
        { option: "unload_modules", kind: "bool", default: false },
        {
          option: "modules",
          kind: "textarea",
          depends: { option: "unload_modules", values: ["1"] },
        },
      ],
    },
    {
      type: "entry",
      multiple: true,
      titleOption: "_ref",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "daysofweek", kind: "dynamiclist", options: DAYS },
        { option: "starttime", kind: "text", required: true },
        { option: "stoptime", kind: "text", required: true },
        { option: "forcewifidown", kind: "bool", default: false },
      ],
    },
  ],
};
