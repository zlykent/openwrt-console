import type { AppSchema } from "../uci-schema";

/**
 * luci-app-autoreboot — "Scheduled Reboot".
 *
 * Mirrors the official CBI model: one anonymous `login` section with the
 * enable flag plus the weekday / hour / minute of the reboot cycle. The
 * official model restarts `/etc/init.d/autoreboot` on apply; the generic app
 * page's "restart after save" switch covers that.
 */

const WEEK_DAYS = [
  { value: "7", label: "Everyday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

export const autoreboot: AppSchema = {
  slug: "autoreboot",
  name: "Scheduled Reboot",
  config: "autoreboot",
  sections: [
    {
      type: "login",
      fields: [
        { option: "enable", kind: "bool", default: false },
        { option: "week", kind: "select", options: WEEK_DAYS, default: "0" },
        { option: "hour", kind: "int", min: 0, max: 23, required: true },
        { option: "minute", kind: "int", min: 0, max: 59, required: true },
      ],
    },
  ],
};
