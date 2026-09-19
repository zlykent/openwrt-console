import { describe, expect, it } from "vitest";
import { radioCommands, wifiIfaceCommands, type RadioConfig, type WifiIfaceConfig } from "./wireless";
import { chain } from "./uci";

const radio = (over: Partial<RadioConfig> = {}): RadioConfig => ({
  name: "radio0",
  channel: "auto",
  country: "",
  htmode: "HT20",
  txpower: "",
  disabled: false,
  ...over,
});

const iface = (over: Partial<WifiIfaceConfig> = {}): WifiIfaceConfig => ({
  ref: "@wifi-iface[0]",
  device: "radio0",
  ssid: "OpenWrt",
  mode: "ap",
  encryption: "none",
  key: "",
  networks: ["lan"],
  hidden: false,
  disabled: false,
  ...over,
});

/** Every `uci delete` must sit in its own subshell guard, never bare. */
function expectGuarded(cmds: string[]) {
  const text = chain(...cmds);
  // A bare `|| true` in an `&&` chain also swallows the failure of every command
  // before it (`A && B || true && C` parses as `((A&&B)||true)&&C`), so a
  // half-written section would still be committed and reported as saved.
  expect(text).not.toMatch(/\|\| true(?!\))/);
  const deletes = text.match(/uci -q delete/g)?.length ?? 0;
  const guarded = text.match(/\(uci -q delete '[^']+' 2>\/dev\/null \|\| true\)/g)?.length ?? 0;
  expect(deletes).toBeGreaterThan(0);
  expect(guarded).toBe(deletes);
}

describe("radioCommands", () => {
  it("can save a radio carrying none of the optional options", () => {
    // `country` and `txpower` are absent on most stock radios and `disabled`
    // means "enabled" when absent, so all three are cleared by a delete that
    // finds nothing and exits non-zero — which used to abort the chain before
    // the commit and made every radio save fail.
    const cmds = radioCommands(radio());
    expectGuarded(cmds);
    expect(cmds).toContain("(uci -q delete 'wireless.radio0.country' 2>/dev/null || true)");
    expect(cmds).toContain("(uci -q delete 'wireless.radio0.txpower' 2>/dev/null || true)");
    expect(cmds).toContain("(uci -q delete 'wireless.radio0.disabled' 2>/dev/null || true)");
    expect(cmds.at(-1)).toBe("uci commit 'wireless'");
  });

  it("writes a value and clears a blanked one", () => {
    const cmds = radioCommands(radio({ channel: "6", country: "CN", txpower: "" }));
    expect(cmds).toContain("uci set 'wireless.radio0.channel'='6'");
    expect(cmds).toContain("uci set 'wireless.radio0.country'='CN'");
    expect(cmds).toContain("(uci -q delete 'wireless.radio0.txpower' 2>/dev/null || true)");
  });

  it("stores the disabled flag as opt-out only", () => {
    expect(radioCommands(radio({ disabled: true }))).toContain(
      "uci set 'wireless.radio0.disabled'='1'",
    );
  });
});

describe("wifiIfaceCommands", () => {
  it("guards every clearing delete", () => {
    expectGuarded(wifiIfaceCommands(iface()));
  });

  it("drops the key when the network is opened", () => {
    // Not cosmetic: a key left behind after switching to `none` stays in a
    // world-readable config file the UI no longer shows a field for.
    const cmds = wifiIfaceCommands(iface({ encryption: "none", key: "hunter2" }));
    expect(cmds).toContain("(uci -q delete 'wireless.@wifi-iface[0].key' 2>/dev/null || true)");
    expect(cmds.some((c) => c.includes("hunter2"))).toBe(false);
  });

  it("keeps the key when the encryption needs one", () => {
    const cmds = wifiIfaceCommands(iface({ encryption: "psk2", key: "hunter2" }));
    expect(cmds).toContain("uci set 'wireless.@wifi-iface[0].key'='hunter2'");
  });

  it("spells a single bridge target the way a stock config does", () => {
    expect(wifiIfaceCommands(iface({ networks: ["lan"] }))).toContain(
      "uci set 'wireless.@wifi-iface[0].network'='lan'",
    );
  });

  it("preserves bridge assignments the editor does not expose", () => {
    // The form only edits the first entry; writing back that one value alone
    // would silently unbridge an AP that also feeds a guest network.
    const cmds = wifiIfaceCommands(iface({ networks: ["lan", "guest"] }));
    expect(cmds).toContain(
      "(uci -q delete 'wireless.@wifi-iface[0].network' 2>/dev/null || true) && " +
        "uci add_list 'wireless.@wifi-iface[0].network'='lan' && " +
        "uci add_list 'wireless.@wifi-iface[0].network'='guest'",
    );
  });

  it("clears the bridge assignment when unassigned", () => {
    const cmds = wifiIfaceCommands(iface({ networks: [] }));
    expect(cmds).toContain("(uci -q delete 'wireless.@wifi-iface[0].network' 2>/dev/null || true)");
    expect(cmds.some((c) => c.includes("add_list 'wireless.@wifi-iface[0].network'"))).toBe(false);
  });

  it("commits wireless last", () => {
    expect(wifiIfaceCommands(iface()).at(-1)).toBe("uci commit 'wireless'");
  });
});
