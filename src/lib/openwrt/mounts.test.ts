import { describe, expect, it } from "vitest";
import {
  GLOBAL_FLAGS,
  SYSTEM_MOUNTPOINTS,
  globalCommands,
  mountCommands,
  parseBlockInfo,
  parseBlockSizes,
  parseDf,
  parseFstabSections,
  parseProbe,
  parseProcFilesystems,
  parseSwapDevices,
  swapCommands,
  validateMountInput,
  validateSwapInput,
  type FstabMountInput,
} from "./mounts";
import { parseUciShow } from "./uci";
import { AppError } from "@/lib/api/errors";

/** Verbatim `uci -q show fstab` from the device under test. */
const UCI_SHOW = `fstab.@global[0]=global
fstab.@global[0].anon_swap='0'
fstab.@global[0].auto_swap='1'
fstab.@global[0].auto_mount='1'
fstab.@global[0].delay_root='5'
fstab.@global[0].check_fs='0'
fstab.@global[0].anon_mount='1'
fstab.@mount[0]=mount
fstab.@mount[0].target='/mnt/mmcblk2p1'
fstab.@mount[0].uuid='B85A-8468'
fstab.@mount[0].enabled='0'
fstab.@swap[0]=swap
fstab.@swap[0].device='/dev/sda1'
fstab.@swap[0].enabled='1'
`;

const DF = `Filesystem                Size      Used Available Use% Mounted on
overlay                 457.4G      7.9G    426.2G   2% /
tmpfs                    64.0M         0     64.0M   0% /dev
shm                      64.0M         0     64.0M   0% /dev/shm
tmpfs                   894.1M      1.6M    892.5M   0% /tmp
/dev/mmcblk2p1          510.0M    169.5M    340.5M  33% /mnt/mmcblk2p1
tmpfs                   894.1M         0    894.1M   0% /tmp/.jail-42/log
/dev/sda1               457.4G      7.9G    426.2G   2% /mnt/My Disk
`;

const BLOCK_INFO = `/dev/mmcblk2p1: UUID="B85A-8468" LABEL="BOOT_EMMC" VERSION="FAT32" MOUNT="/mnt/mmcblk2p1" TYPE="vfat"
/dev/sda1: UUID="9aea617a-6ba8-4d8f-b6c9-8a7f45ffbfad" VERSION="1.0" TYPE="ext4"
`;

const SIZES = `/sys/class/block/loop0/size:0
/sys/class/block/mmcblk2p1/size:1046528
/sys/class/block/sda1/size:976771072
`;

const PROCFS = `nodev\tsysfs
nodev\ttmpfs
\text3
\text4
\tsquashfs
nodev\tautofs
\tvfat
`;

const PROBE = `supported
===BLOCK===
${BLOCK_INFO}===FS===
${PROCFS}===SWAPDEV===
/dev/mmcblk2p1
/dev/sda1
===SIZES===
${SIZES}`;

describe("parseProbe", () => {
  it("keeps the capability flags in head and splits the marker sections", () => {
    const p = parseProbe(PROBE);
    expect(p.head).toContain("supported");
    expect(p.BLOCK).toContain("/dev/mmcblk2p1:");
    expect(p.FS).toContain("ext4");
    expect(p.SWAPDEV.trim().split("\n")).toEqual(["/dev/mmcblk2p1", "/dev/sda1"]);
    expect(p.SIZES).toContain("mmcblk2p1/size:1046528");
  });

  it("reports no capabilities when the device answered nothing", () => {
    const p = parseProbe("");
    expect(p.head).not.toContain("supported");
    expect(p.BLOCK ?? "").toBe("");
  });
});

describe("parseDf", () => {
  it("gates Unmount on the same list LuCI uses", () => {
    const rows = parseDf(DF);
    const byTarget = new Map(rows.map((r) => [r.target, r.umountable]));
    for (const sys of SYSTEM_MOUNTPOINTS) {
      if (byTarget.has(sys)) expect(byTarget.get(sys), sys).toBe(false);
    }
    // /dev/shm is deliberately *not* on LuCI's protected list.
    expect(byTarget.get("/dev/shm")).toBe(true);
    expect(byTarget.get("/mnt/mmcblk2p1")).toBe(true);
  });

  it("drops jail mounts and keeps mount points containing spaces", () => {
    const rows = parseDf(DF);
    expect(rows.some((r) => r.target.startsWith("/tmp/.jail"))).toBe(false);
    const spaced = rows.find((r) => r.target === "/mnt/My Disk");
    expect(spaced?.device).toBe("/dev/sda1");
    expect(spaced?.usePercent).toBe("2%");
  });
});

describe("parseBlockSizes", () => {
  it("converts 512-byte sectors to MiB like LuCI does", () => {
    const sizes = parseBlockSizes(SIZES);
    expect(sizes.get("mmcblk2p1")).toBe(Math.floor(1046528 / 2048));
    expect(sizes.get("loop0")).toBe(0);
    expect(sizes.has("nope")).toBe(false);
  });
});

describe("parseBlockInfo", () => {
  it("lowercases attribute names and attaches the sysfs size", () => {
    const devices = parseBlockInfo(BLOCK_INFO, parseBlockSizes(SIZES));
    expect(devices).toEqual([
      {
        dev: "/dev/mmcblk2p1",
        uuid: "B85A-8468",
        label: "BOOT_EMMC",
        type: "vfat",
        sizeMb: 511,
      },
      {
        dev: "/dev/sda1",
        uuid: "9aea617a-6ba8-4d8f-b6c9-8a7f45ffbfad",
        type: "ext4",
        // 976771072 sectors of 512 bytes = 476939 MiB
        sizeMb: 476939,
      },
    ]);
  });

  it("ignores lines that are not device records", () => {
    expect(parseBlockInfo("block: not found\n", new Map())).toEqual([]);
  });
});

describe("parseProcFilesystems", () => {
  it("skips the nodev rows, which are not mountable filesystems", () => {
    expect(parseProcFilesystems(PROCFS)).toEqual(["ext3", "ext4", "squashfs", "vfat"]);
  });
});

describe("parseSwapDevices", () => {
  it("pairs each globbed device node with its size", () => {
    const devices = parseSwapDevices("/dev/mmcblk2p1\n/dev/sda1\n", parseBlockSizes(SIZES));
    expect(devices).toEqual([
      { dev: "/dev/mmcblk2p1", sizeMb: 511 },
      { dev: "/dev/sda1", sizeMb: 476939 },
    ]);
  });

  it("keeps devices whose size sysfs does not report", () => {
    expect(parseSwapDevices("/dev/mmcblk2rpmb\n", new Map())).toEqual([
      { dev: "/dev/mmcblk2rpmb" },
    ]);
  });
});

describe("parseFstabSections", () => {
  const parsed = parseFstabSections(parseUciShow(UCI_SHOW));

  it("splits mount, swap and global sections", () => {
    expect(parsed.fstab).toHaveLength(1);
    expect(parsed.swap).toHaveLength(1);
    expect(parsed.fstab[0]).toEqual({
      ref: "@mount[0]",
      target: "/mnt/mmcblk2p1",
      device: undefined,
      uuid: "B85A-8468",
      label: undefined,
      fstype: undefined,
      options: undefined,
      enabledFsck: false,
      enabled: false,
    });
    expect(parsed.swap[0]).toEqual({
      ref: "@swap[0]",
      device: "/dev/sda1",
      uuid: undefined,
      label: undefined,
      enabled: true,
    });
  });

  it("reads the five flags LuCI exposes and ignores delay_root", () => {
    expect(parsed.global).toEqual({
      anonSwap: false,
      anonMount: true,
      autoSwap: true,
      autoMount: true,
      checkFs: false,
    });
  });

  it("falls back to LuCI's per-flag defaults when the section is absent", () => {
    const empty = parseFstabSections([]);
    for (const f of GLOBAL_FLAGS) expect(empty.global[f.key]).toBe(f.dflt);
    // automount is on by default, the anonymous ones are off
    expect(empty.global.autoSwap).toBe(true);
    expect(empty.global.anonSwap).toBe(false);
  });
});

const mountInput: FstabMountInput = {
  target: "/mnt/data",
  uuid: "B85A-8468",
  enabled: true,
};

describe("mountCommands", () => {
  it("creates a section without writing empty optional options", () => {
    const cmds = mountCommands("@mount[-1]", mountInput, undefined, false);
    expect(cmds).toEqual([
      "uci set 'fstab.@mount[-1].target'='/mnt/data'",
      "uci set 'fstab.@mount[-1].uuid'='B85A-8468'",
      "uci set 'fstab.@mount[-1].enabled'='1'",
    ]);
    // a blank fstype must not become an empty option in the config file
    expect(cmds.join("\n")).not.toContain("fstype");
  });

  it("writes nothing for an unchanged entry, which would otherwise reorder it", () => {
    const [cur] = parseFstabSections(parseUciShow(UCI_SHOW)).fstab;
    const sections = parseUciShow(UCI_SHOW);
    const sec = sections.find((s) => s.name === cur.ref);
    expect(
      mountCommands(
        cur.ref,
        { target: cur.target, uuid: cur.uuid, enabled: cur.enabled },
        sec,
        false,
      ),
    ).toEqual([]);
  });

  it("deletes an optional option that was cleared instead of storing an empty string", () => {
    const sec = parseUciShow(UCI_SHOW).find((s) => s.name === "@mount[0]");
    const cmds = mountCommands("@mount[0]", { target: "/mnt/mmcblk2p1", enabled: true }, sec, false);
    expect(cmds).toContain("(uci -q delete 'fstab.@mount[0].uuid' 2>/dev/null || true)");
    expect(cmds).toContain("uci set 'fstab.@mount[0].enabled'='1'");
    // the untouched options are not rewritten, which would move them to the end
    expect(cmds.join("\n")).not.toContain("target");
  });

  it("only writes enabled_fsck when the device can actually run it", () => {
    const withFsck = mountCommands("@mount[-1]", { ...mountInput, enabledFsck: true }, undefined, true);
    expect(withFsck.join("\n")).toContain("enabled_fsck'='1'");
    const without = mountCommands("@mount[-1]", { ...mountInput, enabledFsck: true }, undefined, false);
    expect(without.join("\n")).not.toContain("enabled_fsck");
  });
});

describe("swapCommands", () => {
  it("writes device and enabled only", () => {
    expect(swapCommands("@swap[-1]", { device: "/dev/sda1", enabled: true }, undefined)).toEqual([
      "uci set 'fstab.@swap[-1].device'='/dev/sda1'",
      "uci set 'fstab.@swap[-1].enabled'='1'",
    ]);
  });
});

describe("globalCommands", () => {
  const sections = parseUciShow(UCI_SHOW);
  const global = sections.find((s) => s.type === "global");

  it("writes only the flags that changed", () => {
    expect(globalCommands({ autoMount: true, anonSwap: false }, global)).toEqual([]);
    expect(globalCommands({ anonSwap: true }, global)).toEqual([
      "uci set 'fstab.@global[0].anon_swap'='1'",
    ]);
  });

  it("creates the global section when the config has none", () => {
    expect(globalCommands({ checkFs: true }, undefined)).toEqual([
      "uci -q add fstab global >/dev/null",
      "uci set 'fstab.@global[-1].check_fs'='1'",
    ]);
  });

  it("never touches options LuCI does not expose either", () => {
    const cmds = globalCommands(
      { anonSwap: true, anonMount: true, autoSwap: false, autoMount: false, checkFs: true },
      global,
    );
    expect(cmds.join("\n")).not.toContain("delay_root");
  });
});

describe("validateMountInput", () => {
  it("accepts a valid entry", () => {
    expect(() => validateMountInput(mountInput, false)).not.toThrow();
    expect(() =>
      validateMountInput({ target: "/mnt/x", device: "/dev/sda1", enabled: true }, false),
    ).not.toThrow();
    expect(() =>
      validateMountInput({ target: "/mnt/x", label: "BOOT_EMMC", enabled: true }, false),
    ).not.toThrow();
  });

  it("requires one of uuid, label or device, as the depends() chain implies", () => {
    expect(() => validateMountInput({ target: "/mnt/x", enabled: true }, false)).toThrow(AppError);
  });

  it("rejects values that cannot be a config option", () => {
    expect(() => validateMountInput({ ...mountInput, target: "mnt/data" }, false)).toThrow(AppError);
    expect(() => validateMountInput({ ...mountInput, target: "/mnt/a b" }, false)).toThrow(AppError);
    expect(() => validateMountInput({ ...mountInput, device: "sda1" }, false)).toThrow(AppError);
    expect(() => validateMountInput({ ...mountInput, fstype: "ext4; rm" }, false)).toThrow(AppError);
    expect(() => validateMountInput({ ...mountInput, options: "rw,noatime x" }, false)).toThrow(AppError);
  });

  it("allows spaces in a partition label but not quotes", () => {
    expect(() =>
      validateMountInput({ target: "/mnt/x", label: "My Passport", enabled: true }, false),
    ).not.toThrow();
    expect(() =>
      validateMountInput({ target: "/mnt/x", label: "a'b", enabled: true }, false),
    ).toThrow(AppError);
  });

  it("refuses a filesystem check on a device without e2fsck", () => {
    expect(() =>
      validateMountInput({ ...mountInput, enabledFsck: true }, false),
    ).toThrow(AppError);
    expect(() =>
      validateMountInput({ ...mountInput, enabledFsck: true }, true),
    ).not.toThrow();
  });
});

describe("validateSwapInput", () => {
  it("requires a matcher and rejects a relative device node", () => {
    expect(() => validateSwapInput({ enabled: true })).toThrow(AppError);
    expect(() => validateSwapInput({ device: "sda1", enabled: true })).toThrow(AppError);
    expect(() => validateSwapInput({ device: "/dev/sda1", enabled: true })).not.toThrow();
    expect(() => validateSwapInput({ uuid: "B85A-8468", enabled: true })).not.toThrow();
  });
});
