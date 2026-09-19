"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useCreateInterface,
  useDeleteInterface,
  useIfaceConfig,
  useInterfaceAction,
  useInterfaces,
  useRestartNetwork,
  useSaveInterface,
} from "@/hooks/use-openwrt";
import { formatBytes, formatUptime } from "@/lib/format";
import type { NetworkInterface } from "@/lib/openwrt/types";
import type { InterfaceConfig, ZoneAssignment } from "@/lib/openwrt/iface";

/** Protocols the editor knows; each maps to a set of protocol options below. */
const PROTOS = [
  "static",
  "dhcp",
  "dhcpv6",
  "pppoe",
  "pptp",
  "l2tp",
  "wireguard",
  "none",
] as const;

const PROTO_LABEL_KEY: Record<(typeof PROTOS)[number], string> = {
  static: "protoStatic",
  dhcp: "protoDhcp",
  dhcpv6: "protoDhcpv6",
  pppoe: "protoPppoe",
  pptp: "protoPptp",
  l2tp: "protoL2tp",
  wireguard: "protoWireguard",
  none: "protoNone",
};

/**
 * Protocol choices for the editor, plus the interface's current protocol when it
 * is one this editor does not model (`6in4`, `ncm`, `qmi`, …): without that last
 * entry the select renders blank and looks like the protocol was lost.
 */
function protoChoices(labels: Record<(typeof PROTOS)[number], string>, current: string) {
  const choices = PROTOS.map((p) => ({ value: p as string, label: labels[p] }));
  if (current && !choices.some((c) => c.value === current)) {
    choices.push({ value: current, label: current });
  }
  return choices;
}

/**
 * netifd interface error codes and the message each maps to, matching LuCI's
 * `proto_errors` table. Codes it does not know are shown verbatim.
 */
const PROTO_ERROR_KEY: Record<string, string> = {
  CONNECT_FAILED: "errConnectFailed",
  INVALID_ADDRESS: "errInvalidAddress",
  INVALID_GATEWAY: "errInvalidGateway",
  INVALID_LOCAL_ADDRESS: "errInvalidLocalAddress",
  MISSING_ADDRESS: "errMissingAddress",
  MISSING_PEER_ADDRESS: "errMissingPeerAddress",
  NO_DEVICE: "errNoDevice",
  NO_IFACE: "errNoIface",
  NO_IFNAME: "errNoIfname",
  NO_WAN_ADDRESS: "errNoWanAddress",
  NO_WAN_LINK: "errNoWanLink",
  PEER_RESOLVE_FAIL: "errPeerResolveFail",
  PIN_FAILED: "errPinFailed",
};

/**
 * A stand-in runtime record for an interface that exists in
 * `/etc/config/network` but not in netifd yet — it only joins the ubus dump
 * after the network service is restarted. LuCI lists those too; hiding them
 * would make a freshly created interface look like it was never created.
 */
function pendingInterface(cfg: InterfaceConfig): NetworkInterface {
  return {
    name: cfg.name,
    up: false,
    available: false,
    autostart: cfg.auto,
    dynamic: false,
    proto: cfg.proto,
    device: cfg.device || undefined,
    uptime: 0,
    ipv4: [],
    ipv6: [],
    ipv6Prefix: [],
    routes: [],
    dns: [],
  };
}

function Field({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === "" || value === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="truncate text-right text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ListEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const t = useTranslations("network");
  return (
    <div className="space-y-1.5">
      {value.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("removeEntry")}
            title={t("removeEntry")}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ""])}>
        <PlusIcon className="size-3.5" />
        {t("add")}
      </Button>
    </div>
  );
}

function ZoneSelect({
  zones,
  value,
  onChange,
}: {
  zones: ZoneAssignment[];
  value: string;
  onChange: (zone: string) => void;
}) {
  const t = useTranslations("network");
  return (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">{t("zoneUnassigned")}</SelectItem>
        {zones.map((z) => (
          <SelectItem key={z.name} value={z.name}>
            {z.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditDialog({
  initial,
  zones,
  devices,
  onOpenChange,
}: {
  initial: InterfaceConfig;
  zones: ZoneAssignment[];
  devices: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("network");
  const tc = useTranslations("common");
  const [form, setForm] = useState<InterfaceConfig>(initial);
  const save = useSaveInterface();

  function set<K extends keyof InterfaceConfig>(key: K, value: InterfaceConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const usesDevice = ["static", "dhcp", "dhcpv6", "pppoe"].includes(form.proto);
  const usesIpv4 = form.proto === "static";
  const usesCredentials = ["pppoe", "pptp", "l2tp"].includes(form.proto);
  const usesServer = ["pptp", "l2tp"].includes(form.proto);
  const usesWireguard = form.proto === "wireguard";
  const protos = protoChoices(
    Object.fromEntries(PROTOS.map((p) => [p, t(PROTO_LABEL_KEY[p])])) as typeof PROTO_LABEL_KEY,
    form.proto,
  );

  function onSubmit() {
    save.mutate(form, {
      onSuccess: () => {
        toast.success(t("savedConfig"));
        onOpenChange(false);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("editInterface")}: <span className="font-mono">{form.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("proto")}>
              <Select value={form.proto} onValueChange={(v) => set("proto", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {protos.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("zone")}>
              <ZoneSelect zones={zones} value={form.zone} onChange={(v) => set("zone", v)} />
            </FormField>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label className="text-sm">{t("autostart")}</Label>
            <Switch checked={form.auto} onCheckedChange={(v) => set("auto", v)} />
          </div>

          {usesDevice ? (
            <FormField label={t("device")}>
              <Input
                list="iface-devices"
                value={form.device}
                placeholder="eth0 / br-lan"
                onChange={(e) => set("device", e.target.value)}
              />
              <datalist id="iface-devices">
                {devices.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </FormField>
          ) : null}

          {usesIpv4 ? (
            <div className="space-y-3 rounded-lg border p-3">
              <FormField label={t("ipAddresses")}>
                <ListEditor
                  value={form.ipaddr}
                  onChange={(v) => set("ipaddr", v)}
                  placeholder="192.168.1.1/24"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("netmask")}>
                  <Input
                    value={form.netmask}
                    placeholder="255.255.255.0"
                    onChange={(e) => set("netmask", e.target.value)}
                  />
                </FormField>
                <FormField label={t("gateway")}>
                  <Input
                    value={form.gateway}
                    placeholder="192.168.1.254"
                    onChange={(e) => set("gateway", e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          {usesCredentials ? (
            <div className="space-y-3 rounded-lg border p-3">
              {usesServer ? (
                <FormField label={t("server")}>
                  <Input
                    value={form.server}
                    onChange={(e) => set("server", e.target.value)}
                  />
                </FormField>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("username")}>
                  <Input
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </FormField>
                <FormField label={t("password")}>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          {usesWireguard ? (
            <div className="space-y-3 rounded-lg border p-3">
              <FormField label={t("privateKey")}>
                <Input
                  type="password"
                  value={form.privateKey}
                  onChange={(e) => set("privateKey", e.target.value)}
                />
              </FormField>
              <FormField label={t("wgAddresses")}>
                <ListEditor
                  value={form.addresses}
                  onChange={(v) => set("addresses", v)}
                  placeholder="10.0.0.1/24"
                />
              </FormField>
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border p-3">
            <FormField label={t("dnsServers")}>
              <ListEditor
                value={form.dns}
                onChange={(v) => set("dns", v)}
                placeholder="192.168.1.1"
              />
            </FormField>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("peerdns")}</Label>
              <Switch checked={form.peerdns} onCheckedChange={(v) => set("peerdns", v)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label={t("metric")}>
              <Input
                value={form.metric}
                inputMode="numeric"
                onChange={(e) => set("metric", e.target.value)}
              />
            </FormField>
            <FormField label={t("mtu")}>
              <Input
                value={form.mtu}
                inputMode="numeric"
                onChange={(e) => set("mtu", e.target.value)}
              />
            </FormField>
            <FormField label={t("mac")}>
              <Input
                value={form.macaddr}
                placeholder="00:11:22:33:44:55"
                onChange={(e) => set("macaddr", e.target.value)}
              />
            </FormField>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={save.isPending}>
            {save.isPending ? tc("applying") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({
  zones,
  onOpenChange,
}: {
  zones: ZoneAssignment[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("network");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [proto, setProto] = useState<string>("static");
  const [zone, setZone] = useState("");
  const create = useCreateInterface();

  function onSubmit() {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      toast.error(t("nameInvalid"));
      return;
    }
    create.mutate(
      { name, proto, zone },
      {
        onSuccess: () => {
          toast.success(t("created"));
          onOpenChange(false);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addInterface")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label={t("interfaceName")}>
            <Input
              value={name}
              placeholder="guest"
              onChange={(e) => setName(e.target.value.trim())}
            />
          </FormField>
          <FormField label={t("proto")}>
            <Select value={proto} onValueChange={setProto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROTOS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(PROTO_LABEL_KEY[p])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("zone")}>
            <ZoneSelect zones={zones} value={zone} onChange={setZone} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={create.isPending || name === ""}>
            {create.isPending ? tc("applying") : tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InterfaceCard({
  iface,
  config,
  pending,
  removed,
  onEdit,
  onDelete,
}: {
  iface: NetworkInterface;
  config?: InterfaceConfig;
  /** Configured but unknown to netifd, so it has no runtime state to act on. */
  pending?: boolean;
  /** Known to netifd but no longer configured; gone once the service restarts. */
  removed?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("network");
  const tc = useTranslations("common");
  const action = useInterfaceAction();
  const dev = iface.l3Device ?? iface.device;

  function run(kind: "up" | "down" | "renew") {
    action.mutate(
      { name: iface.name, action: kind },
      {
        onSuccess: () => toast.success(t("actionOk")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  const addresses = [...iface.ipv4, ...iface.ipv6]
    .map((a) => `${a.address}/${a.mask}`)
    .filter(Boolean);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={
                  iface.up
                    ? "bg-emerald-500 inline-block size-2 shrink-0 rounded-full"
                    : "bg-muted-foreground/40 inline-block size-2 shrink-0 rounded-full"
                }
              />
              <span className="truncate font-semibold">{iface.name}</span>
              <Badge variant="outline" className="text-[0.65rem]">
                {iface.proto || "—"}
              </Badge>
              {config?.zone ? (
                <Badge variant="secondary" className="text-[0.65rem]">
                  {config.zone}
                </Badge>
              ) : null}
              {pending ? (
                <Badge variant="outline" className="text-[0.65rem]">
                  {t("notApplied")}
                </Badge>
              ) : null}
              {removed ? (
                <Badge variant="outline" className="text-[0.65rem]" title={t("restartToDisappear")}>
                  {t("configRemoved")}
                </Badge>
              ) : null}
            </div>
            {dev ? (
              <p className="text-muted-foreground mt-1 truncate font-mono text-xs">{dev}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            {iface.up ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title={pending ? t("restartToApply") : t("bringDown")}
                aria-label={t("bringDown")}
                disabled={action.isPending || pending}
                onClick={() => run("down")}
              >
                <SquareIcon className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                title={pending ? t("restartToApply") : t("bringUp")}
                aria-label={t("bringUp")}
                disabled={action.isPending || pending}
                onClick={() => run("up")}
              >
                <PlayIcon className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title={pending ? t("restartToApply") : t("renew")}
              aria-label={t("renew")}
              disabled={action.isPending || pending}
              onClick={() => run("renew")}
            >
              <RotateCwIcon className="size-3.5" />
            </Button>
            {config ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("editInterface")}
                  aria-label={t("editInterface")}
                  onClick={onEdit}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t("deleteInterface")}
                      aria-label={t("deleteInterface")}
                      disabled={iface.name === "loopback"}
                    >
                      <TrashIcon className="text-destructive size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteInterface")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("deleteInterfaceConfirm", { name: iface.name })}
                        {addresses.length > 0
                          ? ` ${t("deleteInterfaceWarnAddresses", { addresses: addresses.join(", ") })}`
                          : ""}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={onDelete}>
                        {tc("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </div>
        </div>

        {addresses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {addresses.map((a) => (
              <Badge key={a} variant="secondary" className="font-mono text-[0.7rem]">
                {a}
              </Badge>
            ))}
          </div>
        ) : null}

        {iface.errors && iface.errors.length > 0 ? (
          // netifd accepts an `up` call on a broken interface without complaint,
          // so without this the operator sees "done" and nothing changes.
          <ul className="text-destructive space-y-0.5 text-xs">
            {iface.errors.map((code) => (
              <li key={code}>{PROTO_ERROR_KEY[code] ? t(PROTO_ERROR_KEY[code]) : t("errUnknown", { code })}</li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-2 gap-x-4">
          <div className="divide-y divide-dashed">
            <Field label={t("mac")} value={iface.link?.mac} />
            <Field label={t("mtu")} value={iface.link?.mtu} />
            <Field label={t("speed")} value={iface.link?.speed} />
            <Field label={t("carrier")} value={iface.link?.carrier ? t("up") : t("down")} />
          </div>
          <div className="divide-y divide-dashed">
            <Field label={t("uptime")} value={iface.uptime ? formatUptime(iface.uptime) : undefined} />
            <Field label={t("dns")} value={iface.dns.join(", ") || undefined} />
            {iface.statistics ? (
              <>
                <Field
                  label={t("rxBytes")}
                  value={`${formatBytes(iface.statistics.rxBytes)}`}
                />
                <Field
                  label={t("txBytes")}
                  value={`${formatBytes(iface.statistics.txBytes)}`}
                />
              </>
            ) : null}
          </div>
        </div>

        {iface.routes.length > 0 ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[0.7rem]">
            <ArrowUpIcon className="size-3" />
            {iface.routes.slice(0, 3).map((r, i) => (
              <span key={i} className="font-mono">
                {r.target}/{r.mask}
                {r.nexthop ? ` → ${r.nexthop}` : ""}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function NetworkPage() {
  const t = useTranslations("network");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useInterfaces(10000);
  const restart = useRestartNetwork();
  const cfgQuery = useIfaceConfig();
  const remove = useDeleteInterface();
  const [editing, setEditing] = useState<InterfaceConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const zones = cfgQuery.data?.zones ?? [];
  const devices = cfgQuery.data?.devices ?? [];
  const configByName = new Map((cfgQuery.data?.interfaces ?? []).map((i) => [i.name, i]));

  const configLoaded = cfgQuery.data !== undefined;
  const runtime = data ?? [];
  const running = new Set(runtime.map((i) => i.name));
  // Runtime interfaces first, then the configured-but-not-yet-applied ones.
  const cards = [
    ...runtime.map((iface) => ({
      iface,
      pending: false,
      // netifd keeps serving an interface whose uci section was deleted until the
      // service is restarted, so without a marker a successful delete looks like
      // it did nothing. Dynamic interfaces legitimately have no uci section, and
      // nothing can be concluded before the config query has landed.
      removed: configLoaded && !iface.dynamic && !configByName.has(iface.name),
    })),
    ...(cfgQuery.data?.interfaces ?? [])
      .filter((c) => !running.has(c.name))
      .map((c) => ({ iface: pendingInterface(c), pending: true, removed: false })),
  ];

  function onRestart() {
    restart.mutate(undefined, {
      onSuccess: () => toast.success(t("restartOk")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  function onDelete(name: string) {
    remove.mutate(name, {
      onSuccess: () => toast.success(t("deleted")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          {t("addInterface")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={restart.isPending}>
              <ArrowDownIcon className="size-4" />
              {restart.isPending ? tc("applying") : t("restartNetwork")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("restartNetwork")}</AlertDialogTitle>
              <AlertDialogDescription>{t("restartConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={onRestart}>{tc("confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ iface, pending, removed }) => (
            <InterfaceCard
              key={iface.name}
              iface={iface}
              pending={pending}
              removed={removed}
              config={configByName.get(iface.name)}
              onEdit={() => setEditing(configByName.get(iface.name) ?? null)}
              onDelete={() => onDelete(iface.name)}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground py-12 text-center text-sm">{t("noInterfaces")}</p>
      )}

      {editing ? (
        <EditDialog
          key={editing.name}
          initial={editing}
          zones={zones}
          devices={devices}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {creating ? <CreateDialog zones={zones} onOpenChange={setCreating} /> : null}
    </div>
  );
}
