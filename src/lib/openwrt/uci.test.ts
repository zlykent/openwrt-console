import { describe, expect, it } from "vitest";
import { parseUciShow, firstOption, listOption } from "./uci";

/**
 * `uci show` prints anonymous sections as `pkg.@type[N]`, and type names carry
 * hyphens (`wifi-iface`). A parser that only accepts word characters drops the
 * whole section — the created interface then reads back as absent and every
 * later edit/delete of it answers 404 — so the shape is locked down here.
 */
const SHOW = [
  "wireless.radio0=wifi-device",
  "wireless.radio0.channel='6'",
  "wireless.@wifi-iface[0]=wifi-iface",
  "wireless.@wifi-iface[0].device='radio0'",
  "wireless.@wifi-iface[0].ssid='OpenWrt'",
  "wireless.@wifi-iface[0].network='lan' 'guest'",
  "wireless.@wifi-iface[1]=wifi-iface",
  "wireless.@wifi-iface[1].ssid='qap'",
  "network.lan=interface",
  "network.lan.ipaddr='192.168.3.5'",
].join("\n");

describe("parseUciShow", () => {
  const sections = parseUciShow(SHOW);

  it("keeps anonymous sections whose type name contains a hyphen", () => {
    const anon = sections.filter((s) => s.anonymous);
    expect(anon).toHaveLength(2);
    expect(anon[0]).toMatchObject({ type: "wifi-iface", name: "@wifi-iface[0]", index: 0 });
    expect(anon[1]).toMatchObject({ type: "wifi-iface", name: "@wifi-iface[1]", index: 1 });
  });

  it("reads the options of anonymous hyphenated sections", () => {
    const first = sections.find((s) => s.name === "@wifi-iface[0]");
    expect(firstOption(first, "device")).toBe("radio0");
    expect(firstOption(first, "ssid")).toBe("OpenWrt");
    expect(listOption(first, "network")).toEqual(["lan", "guest"]);
  });

  it("still parses named sections and preserves document order", () => {
    expect(sections.map((s) => s.name)).toEqual([
      "radio0",
      "@wifi-iface[0]",
      "@wifi-iface[1]",
      "lan",
    ]);
    const lan = sections.find((s) => s.name === "lan");
    expect(lan?.type).toBe("interface");
    expect(firstOption(lan, "ipaddr")).toBe("192.168.3.5");
  });
});
