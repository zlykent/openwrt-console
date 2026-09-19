import { describe, expect, it } from "vitest";
import {
  interfaceCommands,
  parseNetDevices,
  zoneCommands,
  type InterfaceConfig,
  type ZoneAssignment,
} from "./iface";
import { chain } from "./uci";

/**
 * The zones of a stock config: both are anonymous, so their uci reference
 * (`@zone[0]`) is not the name an assignment refers to (`lan`).
 */
const zones: ZoneAssignment[] = [
  { ref: "@zone[0]", name: "lan", networks: ["lan"] },
  { ref: "@zone[1]", name: "wan", networks: ["wan", "wan6"] },
];

const iface = (over: Partial<InterfaceConfig> = {}): InterfaceConfig => ({
  name: "lan",
  proto: "static",
  auto: true,
  device: "eth0",
  ipaddr: ["192.168.3.5"],
  netmask: "255.255.255.0",
  gateway: "",
  dns: [],
  peerdns: true,
  metric: "",
  mtu: "",
  macaddr: "",
  username: "",
  password: "",
  server: "",
  privateKey: "",
  addresses: [],
  zone: "lan",
  ...over,
});

describe("interfaceCommands", () => {
  it("can save an interface that carries no optional options at all", () => {
    // `auto` and `peerdns` mean "enabled" when the option is absent, so the
    // enabled state is stored by deleting it. On a stock config that delete
    // finds nothing and exits non-zero, which used to abort the `&&` chain
    // before the commit: editing any interface then always failed.
    const cmds = interfaceCommands(iface(), zones);
    expect(cmds).toContain("(uci -q delete 'network.lan.auto' 2>/dev/null || true)");
    expect(cmds).toContain("(uci -q delete 'network.lan.peerdns' 2>/dev/null || true)");
    expect(cmds.at(-1)).toBe("uci commit 'firewall'");
    expect(cmds.at(-2)).toBe("uci commit 'network'");
  });

  it("guards every clearing delete without breaking the && chain", () => {
    const cmds = interfaceCommands(iface({ auto: false, peerdns: false }), zones);
    const text = chain(...cmds);
    // A bare `|| true` in an `&&` chain also swallows the failure of every
    // command before it (`A && B || true && C` parses as `((A&&B)||true)&&C`),
    // so a half-written section would still be committed and reported as ok.
    expect(text).not.toMatch(/\|\| true(?!\))/);
    // …and every clearing delete is guarded, since the option is usually absent.
    const deletes = text.match(/uci -q delete/g)?.length ?? 0;
    const guarded = text.match(/\(uci -q delete '[^']+' 2>\/dev\/null \|\| true\)/g)?.length ?? 0;
    expect(deletes).toBeGreaterThan(0);
    expect(guarded).toBe(deletes);
  });

  it("writes a non-empty value and clears a blanked one", () => {
    const cmds = interfaceCommands(
      iface({ gateway: "192.168.3.1", netmask: "", mtu: "1400" }),
      zones,
    );
    expect(cmds).toContain("uci set 'network.lan.gateway'='192.168.3.1'");
    expect(cmds).toContain("uci set 'network.lan.mtu'='1400'");
    expect(cmds).toContain("(uci -q delete 'network.lan.netmask' 2>/dev/null || true)");
  });

  it("stores autostart and peerdns opt-out only", () => {
    const cmds = interfaceCommands(iface({ auto: false, peerdns: false }), zones);
    expect(cmds).toContain("uci set 'network.lan.auto'='0'");
    expect(cmds).toContain("uci set 'network.lan.peerdns'='0'");
  });
});

describe("interfaceCommands against the current section", () => {
  it("skips a list the operator never touched", () => {
    // Rewriting a list is a delete plus one add_list per value, which moves the
    // option to the end of the section, so editing the MTU alone must not
    // reshuffle the address and DNS options as a side effect.
    const dns = ["1.1.1.1", "8.8.8.8"];
    const addresses = ["10.0.0.1/24"];
    const cmds = interfaceCommands(
      iface({ mtu: "1400", dns, addresses }),
      zones,
      iface({ dns, addresses }),
    );
    expect(cmds.some((c) => c.includes("network.lan.dns"))).toBe(false);
    expect(cmds.some((c) => c.includes("network.lan.addresses"))).toBe(false);
    expect(cmds.some((c) => c.includes("network.lan.ipaddr"))).toBe(false);
    expect(cmds).toContain("uci set 'network.lan.mtu'='1400'");
  });

  it("treats a reordered list as a change, because uci lists are ordered", () => {
    const cmds = interfaceCommands(
      iface({ dns: ["1.1.1.1", "8.8.8.8"] }),
      zones,
      iface({ dns: ["8.8.8.8", "1.1.1.1"] }),
    );
    expect(cmds.find((c) => c.includes("network.lan.dns"))).toBe(
      "(uci -q delete 'network.lan.dns' 2>/dev/null || true) && " +
        "uci add_list 'network.lan.dns'='1.1.1.1' && uci add_list 'network.lan.dns'='8.8.8.8'",
    );
  });

  it("still clears a list the operator emptied", () => {
    // The dangerous direction: skipping this write would leave a stale DNS
    // server on the device after the field was visibly blanked in the form.
    const cmds = interfaceCommands(iface({ dns: [] }), zones, iface({ dns: ["1.1.1.1"] }));
    expect(cmds).toContain("(uci -q delete 'network.lan.dns' 2>/dev/null || true)");
    expect(cmds.some((c) => c.includes("add_list 'network.lan.dns'"))).toBe(false);
  });

  it("writes every list when the current section is unknown", () => {
    const cmds = interfaceCommands(iface({ addresses: ["10.0.0.1/24"] }), zones);
    expect(cmds.some((c) => c.includes("network.lan.ipaddr"))).toBe(true);
    expect(cmds.some((c) => c.includes("network.lan.addresses"))).toBe(true);
  });
});

describe("zoneCommands", () => {
  it("addresses an anonymous zone by its reference, never by its name", () => {
    // `uci set firewall.lan.network=...` would not touch `@zone[0]`: it creates
    // a brand-new named section and silently leaves the real zone alone.
    const cmds = zoneCommands(zones, "guest", "lan");
    expect(cmds).toEqual([
      "(uci -q delete 'firewall.@zone[0].network' 2>/dev/null || true) && " +
        "uci add_list 'firewall.@zone[0].network'='lan' && " +
        "uci add_list 'firewall.@zone[0].network'='guest'",
    ]);
  });

  it("moves an interface out of the zone it is currently in", () => {
    const cmds = zoneCommands(zones, "lan", "wan");
    expect(cmds).toContain(
      "(uci -q delete 'firewall.@zone[0].network' 2>/dev/null || true)",
    );
    expect(cmds).toContain(
      "(uci -q delete 'firewall.@zone[1].network' 2>/dev/null || true) && " +
        "uci add_list 'firewall.@zone[1].network'='wan' && " +
        "uci add_list 'firewall.@zone[1].network'='wan6' && " +
        "uci add_list 'firewall.@zone[1].network'='lan'",
    );
  });

  it("is a no-op when the assignment already matches", () => {
    expect(zoneCommands(zones, "lan", "lan")).toEqual([]);
    expect(zoneCommands(zones, "guest", "")).toEqual([]);
  });

  it("unassigns from every zone when the zone is cleared", () => {
    expect(zoneCommands(zones, "wan", "")).toEqual([
      "(uci -q delete 'firewall.@zone[1].network' 2>/dev/null || true) && " +
        "uci add_list 'firewall.@zone[1].network'='wan6'",
    ]);
  });
});

describe("parseNetDevices", () => {
  it("lists the kernel devices without lo, as LuCI's picker does", () => {
    expect(parseNetDevices("eth0\nip6tnl0\nlo\nsit0\n")).toEqual(["eth0", "ip6tnl0", "sit0"]);
  });

  it("yields nothing when the probe failed", () => {
    expect(parseNetDevices("")).toEqual([]);
    expect(parseNetDevices("   \n \n")).toEqual([]);
  });
});
