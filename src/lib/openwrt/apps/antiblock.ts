import type { AppSchema } from "../uci-schema";

/**
 * luci-app-antiblock — anti-blocking helper.
 * INCOMPLETE: this app is recent and its exact UCI layout could not be
 * confirmed from the official source (raw/blob fetch blocked, device offline).
 * Only the enable flag is modelled as a placeholder so the app appears in the
 * catalog; all remaining options MUST be filled in from live `uci show
 * antiblock` or the official view.js during device calibration.
 */

export const antiblock: AppSchema = {
  slug: "antiblock",
  name: "Antiblock",
  config: "antiblock",
  service: "antiblock",
  sections: [
    {
      type: "antiblock",
      named: "config",
      fields: [
        { option: "enabled", kind: "bool", default: false },
      ],
    },
  ],
};
