/**
 * Pure WoL constants shared by the Node-only service (`./wol`) and the browser
 * page. Keeping them here stops client components from importing `./wol`,
 * which would pull the ssh2-backed SSH client into the browser bundle.
 */

/** Official `bin = s:option(ListValue, "binary", ...)` values. */
export const WOL_ETHERWAKE = "/usr/bin/etherwake";
export const WOL_WOL = "/usr/bin/wol";

/** Official check before waking: `host:match("^[a-fA-F0-9:]+$")`. */
export const MAC_PATTERN = /^[a-fA-F0-9:]+$/;
