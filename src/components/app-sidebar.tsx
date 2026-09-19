"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  AwardIcon,
  BadgeCheckIcon,
  BarChart3Icon,
  CableIcon,
  CalendarClockIcon,
  ClockIcon,
  CloudIcon,
  CpuIcon,
  DatabaseBackupIcon,
  FastForwardIcon,
  FileCodeIcon,
  FileUpIcon,
  FingerprintIcon,
  FolderOpenIcon,
  GaugeIcon,
  GhostIcon,
  GitBranchIcon,
  GlobeIcon,
  HardDriveIcon,
  KeyIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LightbulbIcon,
  LineChartIcon,
  MemoryStickIcon,
  MusicIcon,
  NetworkIcon,
  PackageIcon,
  PlaneIcon,
  PlugIcon,
  RepeatIcon,
  RocketIcon,
  RouterIcon,
  ScrollTextIcon,
  SendIcon,
  ServerCogIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldHalfIcon,
  ShieldIcon,
  SplitIcon,
  SquareTerminalIcon,
  SwordIcon,
  TvIcon,
  UnplugIcon,
  UserCogIcon,
  UsersIcon,
  WaypointsIcon,
  WifiIcon,
  ZapIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type NavItem = { href: string; labelKey: string; icon: typeof NetworkIcon };
type NavGroup = { labelKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    labelKey: "overview",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboardIcon },
      { href: "/status/processes", labelKey: "processes", icon: CpuIcon },
      { href: "/status/realtime-graphs", labelKey: "realtimeGraphs", icon: LineChartIcon },
      { href: "/status/firewall", labelKey: "statusFirewall", icon: ShieldCheckIcon },
      { href: "/status/connections", labelKey: "statusConnections", icon: ArrowLeftRightIcon },
      { href: "/status/wireguard", labelKey: "wireguard", icon: ShieldIcon },
      { href: "/bandwidth", labelKey: "bandwidth", icon: GaugeIcon },
      { href: "/bandwidth/usage", labelKey: "wrtbwmon", icon: BarChart3Icon },
      { href: "/status/release-ram", labelKey: "releaseRam", icon: MemoryStickIcon },
    ],
  },
  {
    labelKey: "networkSection",
    items: [
      { href: "/network", labelKey: "network", icon: NetworkIcon },
      { href: "/wireless", labelKey: "wireless", icon: WifiIcon },
      { href: "/dhcp", labelKey: "dhcp", icon: UsersIcon },
      { href: "/firewall", labelKey: "firewall", icon: ShieldCheckIcon },
      { href: "/network/routes", labelKey: "routes", icon: GitBranchIcon },
      { href: "/network/switch", labelKey: "switch", icon: CableIcon },
      { href: "/network/diagnostics", labelKey: "diagnostics", icon: ActivityIcon },
{ href: "/apps/arpbind", labelKey: "arpbind", icon: FingerprintIcon },
{ href: "/apps/socat", labelKey: "socat", icon: RepeatIcon },
{ href: "/apps/turboacc", labelKey: "turboacc", icon: FastForwardIcon },
    ],
  },
  {
    labelKey: "systemSection",
    items: [
      { href: "/system", labelKey: "system", icon: SettingsIcon },
      { href: "/system/mounts", labelKey: "mounts", icon: HardDriveIcon },
      { href: "/system/crontab", labelKey: "crontab", icon: ClockIcon },
      { href: "/system/ssh-keys", labelKey: "sshKeys", icon: KeyIcon },
      { href: "/system/ssh-access", labelKey: "sshAccess", icon: KeyRoundIcon },
      { href: "/system/leds", labelKey: "leds", icon: LightbulbIcon },
      { href: "/system/backup", labelKey: "backup", icon: DatabaseBackupIcon },
      { href: "/system/filetransfer", labelKey: "filetransfer", icon: FileUpIcon },
      { href: "/apps/autoreboot", labelKey: "autoreboot", icon: CalendarClockIcon },
      { href: "/services", labelKey: "startup", icon: ServerIcon },
      { href: "/system/rclocal", labelKey: "rcLocal", icon: FileCodeIcon },
      { href: "/packages", labelKey: "packages", icon: PackageIcon },
      { href: "/logs", labelKey: "logs", icon: ScrollTextIcon },
      { href: "/terminal", labelKey: "terminal", icon: SquareTerminalIcon },
    ],
  },
  {
    labelKey: "servicesSection",
    items: [
      { href: "/apps/passwall2", labelKey: "passwall2", icon: RocketIcon },
      { href: "/apps/passwall", labelKey: "passwall", icon: RocketIcon },
      { href: "/apps/v2ray-server", labelKey: "v2rayServer", icon: PlaneIcon },
      { href: "/apps/ssrplus", labelKey: "ssrplus", icon: GhostIcon },
      { href: "/apps/adguardhome", labelKey: "adguardhome", icon: ShieldHalfIcon },
      { href: "/apps/serverchan", labelKey: "serverchan", icon: SendIcon },
      { href: "/apps/unblockmusic", labelKey: "unblockmusic", icon: MusicIcon },
      { href: "/apps/acme", labelKey: "acme", icon: AwardIcon },
      { href: "/apps/openclash", labelKey: "openclash", icon: SwordIcon },
      { href: "/services/ddns", labelKey: "ddns", icon: CloudIcon },
      { href: "/apps/smartdns", labelKey: "smartdns", icon: ServerCogIcon },
      { href: "/services/wol", labelKey: "wol", icon: ZapIcon },
      { href: "/apps/tinyproxy", labelKey: "tinyproxy", icon: GlobeIcon },
      { href: "/apps/uhttpd", labelKey: "uhttpd", icon: ServerIcon },
      { href: "/apps/vlmcsd", labelKey: "vlmcsd", icon: BadgeCheckIcon },
      { href: "/apps/udpxy", labelKey: "udpxy", icon: TvIcon },
      { href: "/apps/haproxy", labelKey: "haproxy", icon: SplitIcon },
      { href: "/services/upnp", labelKey: "upnp", icon: PlugIcon },
    ],
  },
  {
    labelKey: "nasSection",
    items: [{ href: "/apps/filebrowser", labelKey: "filebrowser", icon: FolderOpenIcon }],
  },
  {
    labelKey: "vpnSection",
    items: [
      { href: "/apps/zerotier", labelKey: "zerotier", icon: WaypointsIcon },
      { href: "/apps/udp2raw", labelKey: "udp2raw", icon: UnplugIcon },
      { href: "/apps/ssr-mudb-server", labelKey: "ssrMudb", icon: UserCogIcon },
    ],
  },
  {
    labelKey: "appsSection",
    items: [{ href: "/apps", labelKey: "appCenter", icon: LayoutGridIcon }],
  },
];

/** Longest-prefix match so nested routes (e.g. /services/ddns) resolve to their
 * own item and not a shorter parent prefix (e.g. /services). Shared with the
 * Topbar so the header title always matches the highlighted nav item. */
export function activeNavItem(pathname: string): NavItem | undefined {
  return GROUPS.flatMap((g) => g.items)
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function AppSidebar({ device }: { device?: { host: string; username: string } }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();

  const activeHref = activeNavItem(pathname)?.href;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-primary/10 text-primary flex aspect-square size-8 items-center justify-center rounded-lg">
                  <RouterIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{tc("appName")}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {device ? `${device.username}@${device.host}` : tc("device")}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t(item.labelKey)}>
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
