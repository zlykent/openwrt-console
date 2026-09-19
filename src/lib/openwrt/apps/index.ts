import type { AppSchema } from "../uci-schema";
import { acme } from "./acme";
import { adblock } from "./adblock";
import { adblockFast } from "./adblock-fast";
import { adguardhome } from "./adguardhome";
import { antiblock } from "./antiblock";
import { apinger } from "./apinger";
import { arpbind } from "./arpbind";
import { aria2 } from "./aria2";
import { autoreboot } from "./autoreboot";
import { filebrowser } from "./filebrowser";
import { haproxy } from "./haproxy";
import { openclash } from "./openclash";
import { passwall } from "./passwall";
import { passwall2 } from "./passwall2";
import { serverchan } from "./serverchan";
import { socat } from "./socat";
import { sqm } from "./sqm";
import { smartdns } from "./smartdns";
import { ssrMudbServer } from "./ssr-mudb-server";
import { ssrplus } from "./ssrplus";
import { tinyproxy } from "./tinyproxy";
import { turboacc } from "./turboacc";
import { udpxy } from "./udpxy";
import { uhttpd } from "./uhttpd";
import { udp2raw } from "./udp2raw";
import { unblockmusic } from "./unblockmusic";
import { v2rayServer } from "./v2ray-server";
import { vlmcsd } from "./vlmcsd";
import { watchcat } from "./watchcat";
import { wifischedule } from "./wifischedule";
import { zerotier } from "./zerotier";

/**
 * Registry of schema-driven luci-app pages. Adding an app = one schema file
 * + one entry here; the /apps/[slug] route and /api/apps/[slug] API render and
 * persist it without further code.
 *
 * Action/monitoring apps that are not UCI config forms (e.g. advanced-reboot)
 * and security-sensitive ones (e.g. acl, which edits rpcd) are handled by
 * bespoke pages instead and are intentionally absent here.
 */
export const APP_REGISTRY: Record<string, AppSchema> = {
  acme,
  adblock,
  "adblock-fast": adblockFast,
  adguardhome,
  antiblock,
  apinger,
  arpbind,
  aria2,
  autoreboot,
  filebrowser,
  haproxy,
  openclash,
  passwall,
  passwall2,
  serverchan,
  smartdns,
  socat,
  sqm,
  "ssr-mudb-server": ssrMudbServer,
  ssrplus,
  tinyproxy,
  turboacc,
  udp2raw,
  udpxy,
  uhttpd,
  unblockmusic,
  "v2ray-server": v2rayServer,
  vlmcsd,
  watchcat,
  wifischedule,
  zerotier,
};

export const APP_LIST: AppSchema[] = Object.values(APP_REGISTRY).sort((a, b) =>
  a.slug.localeCompare(b.slug),
);
