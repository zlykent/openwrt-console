import type { AppSchema } from "../uci-schema";

/**
 * luci-app-uhttpd — built-in web server configuration.
 * Fields mirror /etc/config/uhttpd (listener sections + certdefaults).
 */

const KEY_TYPES = [
  { value: "ec", label: "EC" },
  { value: "rsa", label: "RSA" },
];

export const uhttpd: AppSchema = {
  slug: "uhttpd",
  name: "uhttpd",
  config: "uhttpd",
  service: "uhttpd",
  sections: [
    {
      type: "uhttpd",
      multiple: true,
      titleOption: "_ref",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "listen_http", kind: "dynamiclist", default: ["0.0.0.0:80", "[::]:80"] },
            { option: "listen_https", kind: "dynamiclist" },
            { option: "home", kind: "text", default: "/www" },
            { option: "index_page", kind: "text" },
            { option: "redirect_https", kind: "bool", default: false },
            { option: "rfc1918_filter", kind: "bool", default: true },
          ],
        },
        {
          id: "cgi",
          fields: [
            { option: "cgi_prefix", kind: "dynamiclist", default: ["/cgi-bin"] },
            { option: "lua_prefix", kind: "dynamiclist" },
            { option: "lua_handler", kind: "text" },
            { option: "ubus_prefix", kind: "text", default: "/ubus" },
            { option: "ubus_socket", kind: "text", default: "/ubus/ubus.sock" },
          ],
        },
        {
          id: "advanced",
          fields: [
            { option: "cert", kind: "text" },
            { option: "key", kind: "text" },
            { option: "max_requests", kind: "int" },
            { option: "max_connections", kind: "int" },
            { option: "script_timeout", kind: "int", default: "60" },
            { option: "network_timeout", kind: "int", default: "30" },
            { option: "http_keepalive", kind: "int", default: "20" },
            { option: "tcp_keepalive", kind: "int", default: "1" },
            { option: "no_dirlists", kind: "bool", default: false },
            { option: "no_symlinks", kind: "bool", default: false },
          ],
        },
      ],
    },
    {
      type: "certdefaults",
      fields: [
        { option: "days", kind: "int", default: "730" },
        { option: "key_type", kind: "select", options: KEY_TYPES, default: "rsa" },
        { option: "bits", kind: "int", default: "2048" },
        { option: "ec_curve", kind: "text", default: "P-256" },
        { option: "country", kind: "text", default: "DE" },
        { option: "state", kind: "text", default: "Berlin" },
        { option: "location", kind: "text", default: "Berlin" },
        { option: "commonname", kind: "text" },
      ],
    },
  ],
};
