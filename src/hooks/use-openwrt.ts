"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/http";
import type {
  BoardInfo,
  FirewallConfig,
  FirewallDefaults,
  Lease,
  LogEntry,
  MemoryInfo,
  Neighbor,
  NetworkInterface,
  PackageInfo,
  ServiceInfo,
  StatsSample,
  SystemInfo,
  SystemSettings,
  TimezoneEntry,
  WirelessRadio,
  ProcessInfo,
  ActiveRoute,
  StaticRoute,
  MountsState,
  FstabGlobal,
  DdnsGlobal,
  DdnsService,
  UpnpConfig,
  UpnpRule,
  DiagResult,
} from "@/lib/openwrt/types";
import type { PackageResult } from "@/lib/openwrt/packages";
import type { SystemSettingsInput } from "@/lib/openwrt/system";
import type {
  AppConfigPayload,
  AppSummary,
  SectionInstance,
  ServiceOp,
} from "@/lib/openwrt/uci-schema";
import type { IfaceConfigState, InterfaceConfig } from "@/lib/openwrt/iface";
import type {
  FirewallWriteResult,
  ForwardingInput,
  RedirectInput,
  RuleInput,
  ZoneInput,
} from "@/lib/openwrt/firewall";
import type {
  RadioConfig,
  WifiIfaceConfig,
  WirelessConfigState,
} from "@/lib/openwrt/wireless";
import type { SshKeysState } from "@/lib/openwrt/sshkeys";
import type { ConntrackState } from "@/lib/openwrt/conntrack";
import type { FirewallRulesetState } from "@/lib/openwrt/fwstatus";
import type { LedConfigState, LedInput } from "@/lib/openwrt/leds";
import type { DropbearState, DropbearInput } from "@/lib/openwrt/dropbear";
import type { SwitchState, SwitchVlanInput } from "@/lib/openwrt/switch";
import type { WireguardStatus } from "@/lib/openwrt/wireguard";
import type { WolRequest, WolResult, WolState } from "@/lib/openwrt/wol";
import type {
  NlbwConfigInput,
  NlbwConfigState,
  NlbwRecord,
} from "@/lib/openwrt/nlbwmon";
import type { UsageState } from "@/lib/openwrt/wrtbwmon";

/** Central query-key factory so invalidation stays consistent. */
export const qk = {
  board: ["board"] as const,
  info: ["system", "info"] as const,
  stats: ["system", "stats"] as const,
  settings: ["system", "settings"] as const,
  timezones: ["system", "timezones"] as const,
  interfaces: ["network", "interfaces"] as const,
  ifaceConfig: ["network", "iface-config"] as const,
  wireless: ["wireless"] as const,
  wirelessConfig: ["wireless", "config"] as const,
  leases: ["dhcp", "leases"] as const,
  neighbors: ["dhcp", "neighbors"] as const,
  dhcpConfig: ["dhcp", "config"] as const,
  firewall: ["firewall"] as const,
  firewallCustom: ["firewall", "custom"] as const,
  services: ["services"] as const,
  packages: ["packages"] as const,
  logs: (type: "syslog" | "kernel", lines: number) => ["logs", type, lines] as const,
  processes: ["status", "processes"] as const,
  conntrack: ["status", "connections"] as const,
  firewallStatus: ["status", "firewall"] as const,
  routes: ["network", "routes"] as const,
  switch: ["network", "switch"] as const,
  mounts: ["system", "mounts"] as const,
  crontab: ["system", "crontab"] as const,
  sshKeys: ["system", "ssh-keys"] as const,
  rcLocal: ["system", "rclocal"] as const,
  leds: ["system", "leds"] as const,
  sshAccess: ["system", "ssh-access"] as const,
  backup: ["system", "backup"] as const,
  ddns: ["services", "ddns"] as const,
  upnp: ["services", "upnp"] as const,
  wol: ["services", "wol"] as const,
  wireguard: ["status", "wireguard"] as const,
  bandwidth: ["bandwidth", "config"] as const,
  bandwidthData: (period: string) => ["bandwidth", "data", period] as const,
  usage: ["bandwidth", "usage"] as const,
  usageUser: ["bandwidth", "usage", "user"] as const,
};

const post = (path: string, body?: unknown) =>
  apiFetch<{ ok: true }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

// ---- system ----

export function useBoard() {
  return useQuery({ queryKey: qk.board, queryFn: () => apiFetch<BoardInfo>("/api/system/board"), staleTime: 60_000 });
}

export function useSystemInfo() {
  return useQuery({ queryKey: qk.info, queryFn: () => apiFetch<SystemInfo>("/api/system/info") });
}

export function useStats(intervalMs: number | false = 3000) {
  return useQuery({
    queryKey: qk.stats,
    queryFn: () => apiFetch<StatsSample>("/api/system/stats"),
    // Back off when the device errors so a struggling router is not hammered
    // with reconnect attempts (which can saturate dropbear). A manual refetch
    // clears the error and resumes the polling loop.
    refetchInterval: (query) => (query.state.error ? false : intervalMs),
    refetchIntervalInBackground: false,
  });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => apiFetch<SystemSettings>("/api/system/settings") });
}

/** The device's zone table; never refetched, it only changes with a firmware upgrade. */
export function useTimezones() {
  return useQuery({
    queryKey: qk.timezones,
    queryFn: () => apiFetch<TimezoneEntry[]>("/api/system/timezones"),
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SystemSettingsInput) =>
      apiFetch<{ ok: true }>("/api/system/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useReboot() {
  return useMutation({ mutationFn: () => post("/api/system/reboot") });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch<{ ok: true }>("/api/system/password", { method: "POST", body: JSON.stringify({ password }) }),
  });
}

// ---- network ----

export function useInterfaces(intervalMs?: number) {
  return useQuery({
    queryKey: qk.interfaces,
    queryFn: () => apiFetch<NetworkInterface[]>("/api/network/interfaces"),
    refetchInterval: intervalMs,
  });
}

export function useInterfaceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, action }: { name: string; action: "up" | "down" | "renew" }) =>
      post(`/api/network/interfaces/${encodeURIComponent(name)}`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.interfaces }),
  });
}

export function useRestartNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/network/restart"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.interfaces }),
  });
}

// ---- wireless ----

export function useWireless() {
  return useQuery({ queryKey: qk.wireless, queryFn: () => apiFetch<WirelessRadio[]>("/api/wireless") });
}

export function useReloadWireless() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/wireless", { action: "reload" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wireless }),
  });
}

export function useWirelessConfig() {
  return useQuery({
    queryKey: qk.wirelessConfig,
    queryFn: () => apiFetch<WirelessConfigState>("/api/wireless/config"),
  });
}

export function useSaveRadio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (radio: RadioConfig) =>
      apiFetch<{ ok: true }>("/api/wireless/config", {
        method: "PUT",
        body: JSON.stringify({ kind: "radio", radio }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wirelessConfig }),
  });
}

export function useSaveWifiIface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (iface: WifiIfaceConfig) =>
      apiFetch<{ ok: true }>("/api/wireless/config", {
        method: "PUT",
        body: JSON.stringify({ kind: "iface", iface }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wirelessConfig }),
  });
}

export function useCreateWifiIface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { device: string; ssid: string; network: string }) =>
      apiFetch<{ ok: true }>("/api/wireless/config", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wirelessConfig }),
  });
}

export function useDeleteWifiIface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/wireless/config/${encodeURIComponent(ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wirelessConfig }),
  });
}

// ---- dhcp / clients ----

export function useLeases() {
  return useQuery({ queryKey: qk.leases, queryFn: () => apiFetch<Lease[]>("/api/dhcp/leases") });
}

export function useNeighbors(intervalMs?: number) {
  return useQuery({
    queryKey: qk.neighbors,
    queryFn: () => apiFetch<Neighbor[]>("/api/dhcp/neighbors"),
    refetchInterval: intervalMs,
  });
}

export function useDhcpConfig() {
  return useQuery({
    queryKey: qk.dhcpConfig,
    queryFn: () => apiFetch<AppConfigPayload>("/api/dhcp/config"),
  });
}

export function useSaveDhcpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { instances: SectionInstance[]; restart: boolean }) =>
      apiFetch<{ ok: true }>("/api/dhcp/config", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.dhcpConfig }),
  });
}

// ---- firewall ----

export function useFirewall() {
  return useQuery({ queryKey: qk.firewall, queryFn: () => apiFetch<FirewallConfig>("/api/firewall") });
}

export function useUpdateFirewallDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<FirewallDefaults>) =>
      apiFetch<FirewallWriteResult>("/api/firewall", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewall }),
  });
}

export function useFirewallCustom() {
  return useQuery({
    queryKey: qk.firewallCustom,
    queryFn: () => apiFetch<{ content: string }>("/api/firewall/custom"),
  });
}

export function useSaveFirewallCustom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<FirewallWriteResult>("/api/firewall/custom", {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewallCustom }),
  });
}

export function useToggleFirewallSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, enabled }: { ref: string; enabled: boolean }) =>
      apiFetch<FirewallWriteResult>(`/api/firewall/sections/${encodeURIComponent(ref)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewall }),
  });
}

export function useDeleteFirewallSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<FirewallWriteResult>(`/api/firewall/sections/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewall }),
  });
}

type FirewallObjectBody =
  | { kind: "zone"; zone: ZoneInput }
  | { kind: "rule"; rule: RuleInput }
  | { kind: "redirect"; redirect: RedirectInput }
  | { kind: "forwarding"; forwarding: ForwardingInput };

export function useCreateFirewallObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FirewallObjectBody) =>
      apiFetch<FirewallWriteResult>("/api/firewall/objects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewall }),
  });
}

export function useUpdateFirewallObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FirewallObjectBody) =>
      apiFetch<FirewallWriteResult>("/api/firewall/objects", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.firewall }),
  });
}

// ---- services ----

export function useServices() {
  return useQuery({ queryKey: qk.services, queryFn: () => apiFetch<ServiceInfo[]>("/api/services") });
}

export function useServiceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, action }: { name: string; action: "start" | "stop" | "restart" | "reload" | "enable" | "disable" }) =>
      post(`/api/services/${encodeURIComponent(name)}`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.services }),
  });
}

// ---- packages ----

export function usePackages() {
  return useQuery({ queryKey: qk.packages, queryFn: () => apiFetch<PackageInfo[]>("/api/packages"), staleTime: 30_000 });
}

export function usePackageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: "update" } | { action: "install" | "remove"; name: string }) =>
      apiFetch<PackageResult>("/api/packages/action", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.packages }),
  });
}

// ---- logs ----

export function useLogs(type: "syslog" | "kernel" = "syslog", lines = 200, intervalMs?: number) {
  return useQuery({
    queryKey: qk.logs(type, lines),
    queryFn: () => apiFetch<LogEntry[]>(`/api/logs?type=${type}&lines=${lines}`),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
}

// ---- status / processes ----

export function useProcesses(intervalMs?: number) {
  return useQuery({
    queryKey: qk.processes,
    queryFn: () => apiFetch<ProcessInfo[]>("/api/status/processes"),
    refetchInterval: intervalMs,
  });
}

export function useConntrack(intervalMs?: number) {
  return useQuery({
    queryKey: qk.conntrack,
    queryFn: () => apiFetch<ConntrackState>("/api/status/connections"),
    refetchInterval: intervalMs,
  });
}

export function useFirewallStatus(intervalMs?: number) {
  return useQuery({
    queryKey: qk.firewallStatus,
    queryFn: () => apiFetch<FirewallRulesetState>("/api/status/firewall"),
    refetchInterval: intervalMs,
  });
}

export function useKillProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pid: number; signal?: "term" | "kill" }) =>
      post("/api/status/processes", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.processes }),
  });
}

// ---- diagnostics ----

export function useRunDiagnostic() {
  return useMutation({
    mutationFn: (body: { tool: "ping" | "traceroute" | "nslookup"; target: string }) =>
      apiFetch<DiagResult>("/api/network/diagnostics", { method: "POST", body: JSON.stringify(body) }),
  });
}

// ---- routes ----

export type RoutesState = { active: ActiveRoute[]; static: StaticRoute[] };

export function useRoutes() {
  return useQuery({ queryKey: qk.routes, queryFn: () => apiFetch<RoutesState>("/api/network/routes") });
}

export function useSaveRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>("/api/network/routes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.routes }),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/network/routes/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.routes }),
  });
}

// ---- interface configuration (uci) ----

export function useIfaceConfig() {
  return useQuery({
    queryKey: qk.ifaceConfig,
    queryFn: () => apiFetch<IfaceConfigState>("/api/network/iface-config"),
  });
}

export function useSaveInterface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InterfaceConfig) =>
      apiFetch<{ ok: true }>("/api/network/iface-config", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ifaceConfig }),
  });
}

export function useCreateInterface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; proto: string; zone: string }) =>
      apiFetch<{ ok: true }>("/api/network/iface-config", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ifaceConfig }),
  });
}

export function useDeleteInterface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ ok: true }>(`/api/network/iface-config/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ifaceConfig }),
  });
}

// ---- switch ----

export function useSwitch() {
  return useQuery({ queryKey: qk.switch, queryFn: () => apiFetch<SwitchState>("/api/network/switch") });
}

export function useSaveSwitchVlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ref?: string; vlan: SwitchVlanInput }) =>
      apiFetch<{ ok: true }>("/api/network/switch", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.switch }),
  });
}

export function useDeleteSwitchVlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/network/switch/${encodeURIComponent(ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.switch }),
  });
}

// ---- mounts ----

export function useMounts() {
  return useQuery({ queryKey: qk.mounts, queryFn: () => apiFetch<MountsState>("/api/system/mounts") });
}

/** Creates or updates a `mount` or `swap` section; `body.ref` selects the entry. */
export function useSaveMount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>("/api/system/mounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mounts }),
  });
}

export function useSaveFstabGlobal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<FstabGlobal>) =>
      apiFetch<{ ok: true }>("/api/system/mounts/global", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mounts }),
  });
}

export function useDeleteMount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/system/mounts/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mounts }),
  });
}

export type MountActionBody =
  | { action: "apply" }
  | { action: "detect" }
  | { action: "umount"; target: string };

export function useMountAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MountActionBody) =>
      apiFetch<{ ok: true; output?: string }>("/api/system/mounts/action", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mounts }),
  });
}

// ---- crontab ----

export function useCrontab() {
  return useQuery({ queryKey: qk.crontab, queryFn: () => apiFetch<{ content: string }>("/api/system/crontab") });
}

export function useSaveCrontab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ ok: true }>("/api/system/crontab", { method: "PUT", body: JSON.stringify({ content }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.crontab }),
  });
}

export function useSshKeys() {
  return useQuery({ queryKey: qk.sshKeys, queryFn: () => apiFetch<SshKeysState>("/api/system/ssh-keys") });
}

export function useSaveSshKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ ok: true }>("/api/system/ssh-keys", { method: "PUT", body: JSON.stringify({ content }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sshKeys }),
  });
}

export function useRcLocal() {
  return useQuery({ queryKey: qk.rcLocal, queryFn: () => apiFetch<{ content: string }>("/api/system/rclocal") });
}

export function useSaveRcLocal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ ok: true }>("/api/system/rclocal", { method: "PUT", body: JSON.stringify({ content }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rcLocal }),
  });
}

// ---- leds ----

export function useLeds() {
  return useQuery({ queryKey: qk.leds, queryFn: () => apiFetch<LedConfigState>("/api/system/leds") });
}

export function useSaveLed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ref?: string; led: LedInput }) =>
      apiFetch<{ ok: true }>("/api/system/leds", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.leds }),
  });
}

export function useDeleteLed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/system/leds/${encodeURIComponent(ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.leds }),
  });
}

// ---- ssh access (dropbear) ----

export function useDropbear() {
  return useQuery({ queryKey: qk.sshAccess, queryFn: () => apiFetch<DropbearState>("/api/system/ssh-access") });
}

export function useSaveDropbear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ref?: string; dropbear: DropbearInput }) =>
      apiFetch<{ ok: true }>("/api/system/ssh-access", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sshAccess }),
  });
}

export function useDeleteDropbear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/system/ssh-access/${encodeURIComponent(ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sshAccess }),
  });
}

// ---- backup ----

export function useBackupFiles() {
  return useQuery({ queryKey: qk.backup, queryFn: () => apiFetch<{ files: string[] }>("/api/system/backup") });
}

// ---- ddns ----

export type DdnsState = { global: DdnsGlobal; services: DdnsService[]; providers: string[] };

export function useDdns() {
  return useQuery({ queryKey: qk.ddns, queryFn: () => apiFetch<DdnsState>("/api/services/ddns") });
}

export function useSaveDdns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>("/api/services/ddns", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ddns }),
  });
}

export function useDeleteDdns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/services/ddns/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ddns }),
  });
}

// ---- upnp ----

export type UpnpState = { config: UpnpConfig; rules: UpnpRule[] };

export function useUpnp() {
  return useQuery({ queryKey: qk.upnp, queryFn: () => apiFetch<UpnpState>("/api/services/upnp") });
}

export function useSaveUpnpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpnpConfig) =>
      apiFetch<{ ok: true }>("/api/services/upnp", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.upnp }),
  });
}

export function useAddUpnpRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>("/api/services/upnp", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.upnp }),
  });
}

export function useDeleteUpnpRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ ok: true }>(`/api/services/upnp/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.upnp }),
  });
}

// ---- luci-app registry (schema-driven) ----

export function useAppsSummary() {
  return useQuery({
    queryKey: ["apps", "summary"] as const,
    queryFn: () => apiFetch<AppSummary[]>("/api/apps"),
  });
}

export function useAppConfig(slug: string) {
  return useQuery({
    queryKey: ["apps", slug] as const,
    queryFn: () => apiFetch<AppConfigPayload>(`/api/apps/${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });
}

export function useSaveAppConfig(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { instances: SectionInstance[]; restart: boolean }) =>
      apiFetch<{ ok: true }>(`/api/apps/${encodeURIComponent(slug)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

export function useAppServiceOp(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: ServiceOp) =>
      apiFetch<{ ok: true }>(`/api/apps/${encodeURIComponent(slug)}`, {
        method: "POST",
        body: JSON.stringify({ op }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

// ---- wireguard status ----

/** Polled every 5s, matching the official `XHR.poll(5, ...)` view. */
export function useWireguardStatus(intervalMs: number | false = 5000) {
  return useQuery({
    queryKey: qk.wireguard,
    queryFn: () => apiFetch<WireguardStatus>("/api/status/wireguard"),
    refetchInterval: intervalMs,
  });
}

// ---- wake on lan ----

export function useWol() {
  return useQuery({ queryKey: qk.wol, queryFn: () => apiFetch<WolState>("/api/wol") });
}

export function useWakeHost() {
  return useMutation({
    mutationFn: (body: WolRequest) =>
      apiFetch<WolResult>("/api/wol", { method: "POST", body: JSON.stringify(body) }),
  });
}

// ---- bandwidth monitor (nlbwmon) ----

export function useNlbwConfig() {
  return useQuery({
    queryKey: qk.bandwidth,
    queryFn: () => apiFetch<NlbwConfigState>("/api/bandwidth"),
  });
}

export function useSaveNlbwConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NlbwConfigInput) =>
      apiFetch<{ ok: true }>("/api/bandwidth", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bandwidth });
      qc.invalidateQueries({ queryKey: ["bandwidth", "data"] });
    },
  });
}

/** "Force reload…" — the official `admin/nlbw/commit` action. */
export function useNlbwCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/bandwidth", { method: "POST", body: JSON.stringify({ op: "commit" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bandwidth });
      qc.invalidateQueries({ queryKey: ["bandwidth", "data"] });
    },
  });
}

/** Same grouping/ordering the official display page requests. */
export const NLBW_DISPLAY_GROUP = "family,mac,ip,layer7";
export const NLBW_DISPLAY_ORDER = "-rx_bytes,-tx_bytes";

export function useNlbwData(period: string, enabled = true) {
  return useQuery({
    queryKey: qk.bandwidthData(period),
    queryFn: () => {
      const params = new URLSearchParams({
        group_by: NLBW_DISPLAY_GROUP,
        order_by: NLBW_DISPLAY_ORDER,
      });
      if (period) params.set("period", period);
      return apiFetch<{ rows: NlbwRecord[] }>(`/api/bandwidth/data?${params.toString()}`);
    },
    enabled,
  });
}

export function useRestoreNlbwBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("archive", file);
      return apiFetch<{ files: string[] }>("/api/bandwidth/backup", { method: "POST", body: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bandwidth });
      qc.invalidateQueries({ queryKey: ["bandwidth", "data"] });
    },
  });
}

// ---- wrtbwmon (admin/nlbw/usage) ----

/** Official `usage_data` call; `refetchInterval` drives the auto-refresh select. */
export function useUsage(refetchInterval?: number) {
  return useQuery({
    queryKey: qk.usage,
    queryFn: () => apiFetch<UsageState>("/api/bandwidth/usage"),
    refetchInterval,
    refetchIntervalInBackground: false,
  });
}

/** Official `usage_reset` call: flush then delete the database file. */
export function useResetUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/bandwidth/usage", { method: "POST", body: JSON.stringify({ op: "reset" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.usage }),
  });
}

/** Official `config` page: the `persist` flag (also moves the database file). */
export function useSaveUsagePersist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (persist: boolean) =>
      apiFetch<{ ok: true }>("/api/bandwidth/usage/config", { method: "PUT", body: JSON.stringify({ persist }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.usage }),
  });
}

/** Official `custom` page: `/etc/config/wrtbwmon.user`. */
export function useUsageUserFile() {
  return useQuery({
    queryKey: qk.usageUser,
    queryFn: () => apiFetch<{ content: string }>("/api/bandwidth/usage/user"),
  });
}

export function useSaveUsageUserFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ ok: true }>("/api/bandwidth/usage/user", { method: "PUT", body: JSON.stringify({ content }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.usageUser }),
  });
}

// ---- release_ram (admin/status/release_ram) ----

export function useReleaseRam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ before: MemoryInfo; after: MemoryInfo; freed: number }>("/api/system/release-ram", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.info }),
  });
}
