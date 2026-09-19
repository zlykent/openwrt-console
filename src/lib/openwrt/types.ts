/**
 * Typed DTOs normalised from raw ubus / uci / proc output.
 * Shapes mirror what the target device actually returns (verified by probing).
 */

export type BoardRelease = {
  distribution: string;
  version: string;
  revision: string;
  target: string;
  description: string;
};

export type BoardInfo = {
  kernel: string;
  hostname: string;
  system: string;
  model: string;
  boardName: string;
  release: BoardRelease;
};

export type MemoryInfo = {
  total: number;
  free: number;
  used: number;
  available: number;
  cached: number;
  buffered: number;
  shared: number;
};

export type SwapInfo = { total: number; free: number };

export type SystemInfo = {
  uptime: number;
  localtime: number;
  load: [number, number, number];
  memory: MemoryInfo;
  swap: SwapInfo;
};

export type CpuCounters = { idle: number; total: number };

export type InterfaceCounters = {
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
};

/** A point-in-time sample used to derive rates on the client. */
export type StatsSample = {
  at: number;
  uptime: number;
  load: [number, number, number];
  cpu: CpuCounters;
  memory: MemoryInfo;
  swap: SwapInfo;
  interfaces: Record<string, InterfaceCounters>;
};

export type InterfaceAddress = { address: string; mask: number };
export type InterfaceRoute = { target: string; mask: number; nexthop?: string };

export type NetworkInterface = {
  name: string;
  up: boolean;
  available: boolean;
  autostart: boolean;
  dynamic: boolean;
  proto: string;
  device?: string;
  l3Device?: string;
  uptime: number;
  ipv4: InterfaceAddress[];
  ipv6: InterfaceAddress[];
  ipv6Prefix: InterfaceAddress[];
  routes: InterfaceRoute[];
  dns: string[];
  /**
   * netifd error codes from the interface's ubus runtime state (`NO_DEVICE`,
   * `CONNECT_FAILED`, …). An `up` call on a broken interface still succeeds at
   * the ubus level, so this is the only place the reason is reported.
   */
  errors?: string[];
  statistics?: InterfaceCounters;
  link?: DeviceStatus;
};

export type DeviceStatus = {
  name: string;
  up: boolean;
  carrier: boolean;
  mac?: string;
  mtu?: number;
  speed?: string;
  type?: string;
  statistics?: InterfaceCounters;
};

export type Lease = {
  ip: string;
  mac: string;
  hostname?: string;
  expires: number;
  iface?: string;
};

export type Neighbor = {
  ip: string;
  mac: string;
  state: string;
  dev: string;
};

/**
 * `config defaults` — the "General Settings" block of LuCI's
 * `admin/network/firewall` (luci/model/cbi/firewall/zones.lua). The option set
 * follows that file on this device: `syn_flood`, `drop_invalid`, `fullcone` and
 * the three policies. `flow_offloading` is not in this build's zones.lua (the
 * vendor exposes it through luci-app-turboacc instead) but it is a real fw3
 * option present in the stock config, so it stays editable here.
 */
export type FirewallDefaults = {
  input: string;
  output: string;
  forward: string;
  synFlood: boolean;
  dropInvalid: boolean;
  fullcone: boolean;
  flowOffloading: boolean;
};

/** `config zone` — zones.lua (list) plus zone-details.lua (general/advanced). */
export type FirewallZone = {
  /** uci section reference (named or `@zone[n]`), used for mutations. */
  ref?: string;
  name: string;
  /** Covered networks, stored as a uci list. */
  networks: string[];
  input: string;
  output: string;
  forward: string;
  masq: boolean;
  mtuFix: boolean;
  /** "" = IPv4 and IPv6, otherwise "ipv4" | "ipv6". */
  family?: string;
  /** Space separated subnets restricting masquerading (advanced tab). */
  masqSrc?: string;
  masqDest?: string;
  conntrack: boolean;
  log: boolean;
  /** Only meaningful while `log` is on; LuCI hides it otherwise. */
  logLimit?: string;
};

/** `config forwarding` — one direction of an inter-zone forward. */
export type FirewallForwarding = {
  /** uci section reference (named or `@forwarding[n]`), used for mutations. */
  ref?: string;
  src: string;
  dest: string;
};

/** `config rule` — rule-details.lua. */
export type FirewallRule = {
  /** uci section reference (named or `@rule[n]`), used for mutations. */
  ref?: string;
  name?: string;
  /** "" = IPv4 and IPv6, otherwise "ipv4" | "ipv6". */
  family?: string;
  /** Free text as in LuCI ("tcp", "udp", "tcp udp", "icmp", "igmp", "esp", "all", ...). */
  proto?: string;
  /** Space separated icmp types, stored as a uci list. */
  icmpType?: string;
  /** Zone name, "*" (any zone) or "" (this device). */
  src?: string;
  srcMac?: string;
  srcIp?: string;
  srcPort?: string;
  dest?: string;
  destIp?: string;
  destPort?: string;
  /** ACCEPT | REJECT | DROP | NOTRACK. */
  target: string;
  /** Raw extra iptables arguments. */
  extra?: string;
  weekdays?: string;
  monthdays?: string;
  startTime?: string;
  stopTime?: string;
  startDate?: string;
  stopDate?: string;
  utcTime: boolean;
  /** Absent `enabled` means the rule is active. */
  enabled: boolean;
  /** Read-only rate limit, shown in the list like LuCI does. */
  limit?: string;
};

/**
 * `config redirect` — forward-details.lua for `target DNAT` (port forwards) and
 * the SNAT branch of rule-details.lua for `target SNAT` (source NAT).
 */
export type FirewallRedirect = {
  /** uci section reference (named or `@redirect[n]`), used for mutations. */
  ref?: string;
  name?: string;
  target: string;
  proto?: string;
  src?: string;
  srcMac?: string;
  srcIp?: string;
  srcPort?: string;
  /** External (DNAT) / rewritten source (SNAT) IP address. */
  srcDip?: string;
  /** External (DNAT) / rewritten source (SNAT) port. */
  srcDport?: string;
  /** Internal zone; LuCI defaults it to "lan". */
  dest?: string;
  destIp?: string;
  destPort?: string;
  /** NAT loopback; fw3 defaults it to on, so absent means enabled. */
  reflection: boolean;
  extra?: string;
  enabled: boolean;
};

export type FirewallConfig = {
  defaults: FirewallDefaults;
  zones: FirewallZone[];
  forwarding: FirewallForwarding[];
  rules: FirewallRule[];
  redirects: FirewallRedirect[];
};

export type ServiceInstance = {
  name: string;
  running: boolean;
  pid?: number;
  command?: string[];
};

export type ServiceInfo = {
  name: string;
  running: boolean;
  /** Whether an `/etc/rc.d` start link exists (enabled at boot). */
  enabled?: boolean;
  instances: ServiceInstance[];
};

export type LogEntry = {
  /**
   * Timestamp in seconds. For the ubus path this is a real epoch; for the
   * `logread` text fallback it is derived from the device's wall-clock (see
   * `timeText`) and used only for ordering/filtering.
   */
  time: number;
  /** Raw timestamp exactly as the device printed it (logread fallback only). */
  timeText?: string;
  priority?: string;
  source?: string;
  msg: string;
};

export type PackageInfo = { name: string; version: string };

export type WirelessNetwork = {
  iface: string;
  /** UCI section ref (e.g. `@wifi-iface[0]`) so the editor can target it. */
  section?: string;
  ssid?: string;
  bssid?: string;
  channel?: number;
  frequency?: number;
  mode?: string;
  encryption?: string;
  enabled: boolean;
  signal?: number;
  stations: {
    mac: string;
    signal?: number;
    /** Transmit rate in Mbit/s (ubus reports kbit/s; converted when parsed). */
    bitrate?: number;
    rxBytes?: number;
    txBytes?: number;
    connected?: number;
  }[];
};

export type WirelessRadio = {
  name: string;
  up: boolean;
  channel?: number;
  frequency?: number;
  txpower?: number;
  networks: WirelessNetwork[];
};

export type SystemSettings = {
  hostname: string;
  /** uci `zonename`, e.g. "Asia/Shanghai". */
  zonename: string;
  /** uci `timezone`, the POSIX TZ string, e.g. "CST-8". */
  timezone: string;
  /**
   * LuCI's "Logging" tab. Every field is `o.optional = true` there, so an empty
   * string means the option is absent from the config rather than set to "".
   */
  logSize: string;
  logIp: string;
  logPort: string;
  logProto: string;
  logFile: string;
  conloglevel: string;
  cronloglevel: string;
  ntpEnabled: boolean;
  /** uci `enable_server`: let the device serve time to its own networks. */
  ntpServer: boolean;
  ntpServers: string[];
};

/** One row of the device's own zone table (`luci.sys.zoneinfo.TZ`). */
export type TimezoneEntry = {
  /** The value stored in uci `zonename`, e.g. "Asia/Tokyo". */
  name: string;
  /** The POSIX TZ string LuCI derives from it, e.g. "JST-9". */
  tz: string;
};

// ---- phase 2: full LuCI surface ----

export type ProcessInfo = {
  pid: number;
  ppid: number;
  user: string;
  stat: string;
  vsz: number;
  pctMem: number;
  pctCpu: number;
  command: string;
};

/** An active route from the kernel routing table. */
export type ActiveRoute = {
  target: string;
  /** Route class for special routes, e.g. `unreachable` or `blackhole`. */
  type?: string;
  gateway?: string;
  device?: string;
  proto?: string;
  scope?: string;
  source?: string;
  metric?: string;
};

/** A configured static route (uci `network` route / route6 section). */
export type StaticRoute = {
  ref: string;
  kind: "route" | "route6";
  name?: string;
  iface: string;
  target: string;
  netmask?: string;
  gateway?: string;
  metric?: string;
  /** Per-route MTU clamp (uci `mtu`, LuCI accepts 64..9000). */
  mtu?: string;
  /**
   * Route class (uci `type`, e.g. `blackhole`). LuCI renders `unicast` for an
   * absent option, so the canonical unicast route stores no `type` at all.
   */
  type?: string;
  enabled: boolean;
};

export type MountEntry = {
  device: string;
  size: string;
  used: string;
  available: string;
  usePercent: string;
  target: string;
  /**
   * LuCI hides the Unmount button for the filesystems the running system
   * depends on; the same list gates the action here and in the API.
   */
  umountable: boolean;
};

export type FstabMount = {
  ref: string;
  target: string;
  device?: string;
  uuid?: string;
  label?: string;
  fstype?: string;
  options?: string;
  enabledFsck: boolean;
  enabled: boolean;
};

export type FstabSwap = {
  ref: string;
  device?: string;
  uuid?: string;
  label?: string;
  enabled: boolean;
};

/** The `config global` section of /etc/config/fstab (LuCI: Global Settings). */
export type FstabGlobal = {
  anonSwap: boolean;
  anonMount: boolean;
  autoSwap: boolean;
  autoMount: boolean;
  checkFs: boolean;
};

/** One `block info` entry, plus the size LuCI reads from sysfs. */
export type BlockDevice = {
  dev: string;
  uuid?: string;
  label?: string;
  type?: string;
  sizeMb?: number;
};

export type MountsState = {
  /** LuCI only offers the page when /sbin/block and /etc/config/fstab exist. */
  supported: boolean;
  mounts: MountEntry[];
  fstab: FstabMount[];
  swap: FstabSwap[];
  global: FstabGlobal;
  devices: BlockDevice[];
  fstypes: string[];
  swapDevices: BlockDevice[];
  hasFsck: boolean;
};

export type DdnsGlobal = {
  dateFormat: string;
  logLines: string;
  updatePrivateIp: boolean;
};

export type DdnsService = {
  ref: string;
  name: string;
  enabled: boolean;
  serviceName?: string;
  lookupHost?: string;
  domain?: string;
  updateUrl?: string;
  username?: string;
  checkInterval?: string;
  forceInterval?: string;
  ipSource?: string;
  useIpv6: boolean;
};

export type UpnpConfig = {
  enabled: boolean;
  enableNatpmp: boolean;
  enableUpnp: boolean;
  secureMode: boolean;
  logOutput: boolean;
  download: string;
  upload: string;
  internalIface: string;
  port: string;
};

export type UpnpRule = {
  ref: string;
  action: string;
  extPorts: string;
  intAddr: string;
  intPorts: string;
  comment?: string;
};

export type DiagResult = {
  tool: "ping" | "traceroute" | "nslookup";
  target: string;
  stdout: string;
  stderr: string;
  code: number | null;
};
