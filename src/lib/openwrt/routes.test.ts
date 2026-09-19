import { describe, expect, it } from "vitest";
import {
  buildRouteCommands,
  parseIpRoute,
  resolveRouteSection,
  type StaticRouteInput,
} from "./routes";
import { chain } from "./uci";
import { AppError } from "@/lib/api/errors";

const IP4 = `default via 192.168.3.1 dev eth0 proto static
192.168.3.0/24 dev eth0 proto kernel scope link src 192.168.3.5`;

const IP6 = `fd12:2835:954::/64 dev eth0 proto static metric 1024 pref medium
unreachable fd12:2835:954::/48 dev lo proto static metric 2147483647 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium`;

const routeInput: StaticRouteInput = {
  kind: "route",
  iface: "lan",
  target: "10.9.0.0/16",
  enabled: true,
};

describe("buildRouteCommands", () => {
  it("creates a route by naming the section, never with add + rename", () => {
    const cmds = buildRouteCommands({ ...routeInput }, undefined, "qnew");
    // `uci rename network.@route[-1]=x` does not name the anonymous section
    // that `uci add` just created: it rewrites that section's *type*, leaving
    // an orphan which reverting `network.x` cannot remove.
    expect(cmds[0]).toBe("uci set 'network.qnew'='route'");
    expect(cmds.join(" | ")).not.toMatch(/uci -q add|@route\[-1\]/);
  });

  it("guards a cleared optional field without breaking the && chain", () => {
    const cmds = buildRouteCommands({ ...routeInput, gateway: "" }, "q", "q");
    expect(cmds).toContain("(uci -q delete 'network.q.gateway' 2>/dev/null || true)");
    // A guard must be parenthesised: a bare `|| true` spliced into an `&&`
    // chain also swallows the failure of every command before it, so a
    // half-written section would still be committed and reported as success.
    expect(chain(...cmds)).not.toMatch(/\|\| true(?!\))/);
  });

  it("renames before retyping when the name changed", () => {
    const cmds = buildRouteCommands({ ...routeInput, name: "qnew" }, "qold", "qnew");
    expect(cmds[0]).toBe("uci -q rename 'network.qold'='qnew'");
    expect(cmds[1]).toBe("uci set 'network.qnew'='route'");
  });

  it("retypes in place when only the address family changed", () => {
    const cmds = buildRouteCommands(
      { ...routeInput, kind: "route6", target: "fd00::/64" },
      "q",
      "q",
    );
    expect(cmds).toContain("uci set 'network.q'='route6'");
    expect(cmds.some((c) => c.includes("rename"))).toBe(false);
  });

  it("stores the enabled flag inverted and commits last", () => {
    const cmds = buildRouteCommands({ ...routeInput, enabled: false }, "q", "q");
    expect(cmds).toContain("uci set 'network.q.disabled'='1'");
    expect(cmds.at(-1)).toBe("uci commit 'network'");
  });

  it("writes the route type and MTU the LuCI form offers", () => {
    const cmds = buildRouteCommands({ ...routeInput, mtu: "1400", type: "blackhole" }, "q", "q");
    expect(cmds).toContain("uci set 'network.q.mtu'='1400'");
    expect(cmds).toContain("uci set 'network.q.type'='blackhole'");
  });

  it("stores unicast as an absent type, exactly like LuCI", () => {
    // LuCI's candidate list maps `unicast` to the empty value, so a plain
    // route carries no `type` option; writing one would make our saves differ
    // from LuCI's for the default case.
    const cmds = buildRouteCommands({ ...routeInput, type: "unicast" }, "q", "q");
    expect(cmds).toContain("(uci -q delete 'network.q.type' 2>/dev/null || true)");
    expect(cmds.join(" | ")).not.toMatch(/\.type'=/);
  });

  it("rejects an MTU outside the 64..9000 range LuCI allows", () => {
    expect(() => buildRouteCommands({ ...routeInput, mtu: "9001" }, "q", "q")).toThrow(AppError);
    expect(() => buildRouteCommands({ ...routeInput, mtu: "abc" }, "q", "q")).toThrow(AppError);
  });
});

describe("resolveRouteSection", () => {
  it("falls back to the generated name for a new unnamed route", () => {
    expect(resolveRouteSection({ ...routeInput }, undefined, "route_x")).toBe("route_x");
  });

  it("keeps the existing ref when no new name is given", () => {
    expect(resolveRouteSection({ ...routeInput }, "qold", "route_x")).toBe("qold");
  });

  it("rejects a name uci could not address as a section", () => {
    expect(() => resolveRouteSection({ ...routeInput, name: "a;reboot" }, undefined, "g")).toThrow(
      AppError,
    );
  });
});

describe("parseIpRoute", () => {
  it("parses a default route with gateway and device", () => {
    const [def] = parseIpRoute(IP4);
    expect(def).toEqual({ target: "default", gateway: "192.168.3.1", device: "eth0", proto: "static" });
  });

  it("parses a link-scoped route with a source address", () => {
    const [, lan] = parseIpRoute(IP4);
    expect(lan).toEqual({
      target: "192.168.3.0/24",
      device: "eth0",
      proto: "kernel",
      scope: "link",
      source: "192.168.3.5",
    });
  });

  it("keeps the destination of a classed route such as unreachable", () => {
    const [, unreach] = parseIpRoute(IP6);
    expect(unreach.target).toBe("fd12:2835:954::/48");
    expect(unreach.type).toBe("unreachable");
    expect(unreach.device).toBe("lo");
    expect(unreach.metric).toBe("2147483647");
  });

  it("reads the metric and ignores trailing pref", () => {
    const [prefix] = parseIpRoute(IP6);
    expect(prefix.metric).toBe("1024");
    expect(prefix).not.toHaveProperty("pref");
  });

  it("skips blank lines left by the v4/v6 separator", () => {
    expect(parseIpRoute("\n\n  \n")).toEqual([]);
  });
});
