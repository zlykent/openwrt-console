"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SignalIcon,
  TrashIcon,
  UsersIcon,
  WifiIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  useCreateWifiIface,
  useDeleteWifiIface,
  useIfaceConfig,
  useReloadWireless,
  useSaveRadio,
  useSaveWifiIface,
  useWireless,
  useWirelessConfig,
} from "@/hooks/use-openwrt";
import type { WirelessNetwork, WirelessRadio } from "@/lib/openwrt/types";
import type { RadioConfig, WifiIfaceConfig } from "@/lib/openwrt/wireless";

const CHANNELS = [
  "auto",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13",
  "36", "40", "44", "48", "52", "56", "60", "64",
  "149", "153", "157", "161", "165",
];

const HTMODES = ["HT20", "HT40", "VHT20", "VHT40", "VHT80", "VHT160", "HE20", "HE40", "HE80", "HE160"];

const ENCRYPTIONS = [
  { value: "none", key: "encNone" },
  { value: "wep-open", key: "encWepOpen" },
  { value: "wep-shared", key: "encWepShared" },
  { value: "psk", key: "encPsk" },
  { value: "psk2", key: "encPsk2" },
  { value: "psk-mixed", key: "encPskMixed" },
  { value: "sae", key: "encSae" },
  { value: "sae-mixed", key: "encSaeMixed" },
];

const MODES = [
  { value: "ap", key: "modeAp" },
  { value: "sta", key: "modeSta" },
  { value: "mesh", key: "modeMesh" },
];

function signalBars(signal?: number): number {
  if (signal === undefined) return 0;
  // Roughly map dBm (-100..-30) to 0..4 bars.
  if (signal >= -50) return 4;
  if (signal >= -60) return 3;
  if (signal >= -70) return 2;
  if (signal >= -80) return 1;
  return 0;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function RadioEditDialog({
  initial,
  onOpenChange,
}: {
  initial: RadioConfig;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("wireless");
  const tc = useTranslations("common");
  const [form, setForm] = useState<RadioConfig>(initial);
  const save = useSaveRadio();
  const reload = useReloadWireless();

  function set<K extends keyof RadioConfig>(key: K, value: RadioConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit() {
    save.mutate(form, {
      onSuccess: () => {
        reload.mutate(undefined);
        toast.success(t("savedWireless"));
        onOpenChange(false);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("editRadio")}: <span className="font-mono">{form.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("channel")}>
              <Select value={form.channel || "auto"} onValueChange={(v) => set("channel", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("htmode")}>
              <Select value={form.htmode || "HT20"} onValueChange={(v) => set("htmode", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTMODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("country")}>
              <Input
                value={form.country}
                placeholder="CN"
                maxLength={2}
                onChange={(e) => set("country", e.target.value.toUpperCase())}
              />
            </FormField>
            <FormField label={t("txpower")}>
              <Input
                value={form.txpower}
                inputMode="numeric"
                placeholder="dBm"
                onChange={(e) => set("txpower", e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label className="text-sm">{t("radioDisabled")}</Label>
            <Switch checked={form.disabled} onCheckedChange={(v) => set("disabled", v)} />
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

function IfaceEditDialog({
  initial,
  networks,
  onOpenChange,
}: {
  initial: WifiIfaceConfig;
  networks: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("wireless");
  const tc = useTranslations("common");
  const [form, setForm] = useState<WifiIfaceConfig>(initial);
  const save = useSaveWifiIface();
  const reload = useReloadWireless();

  function set<K extends keyof WifiIfaceConfig>(key: K, value: WifiIfaceConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const needsKey = form.encryption !== "none" && form.encryption !== "";

  function onSubmit() {
    save.mutate(form, {
      onSuccess: () => {
        reload.mutate(undefined);
        toast.success(t("savedWireless"));
        onOpenChange(false);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("editNetwork")}: <span className="font-mono">{form.ssid || form.ref}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label={t("ssid")}>
            <Input value={form.ssid} onChange={(e) => set("ssid", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("mode")}>
              <Select value={form.mode || "ap"} onValueChange={(v) => set("mode", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {t(m.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("networkBridge")}>
              <Select
                value={form.networks[0] || "__none"}
                onValueChange={(v) =>
                  set("networks", v === "__none" ? [] : [v, ...form.networks.slice(1)])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("unassigned")}</SelectItem>
                  {networks.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.networks.length > 1 ? (
                // A wifi-iface can feed several networks; the select only edits
                // the first, so the rest have to stay visible or saving looks
                // like it silently dropped them.
                <p className="text-muted-foreground text-xs">
                  {t("extraBridges", { networks: form.networks.slice(1).join(", ") })}
                </p>
              ) : null}
            </FormField>
          </div>
          <FormField label={t("encryption")}>
            <Select value={form.encryption || "none"} onValueChange={(v) => set("encryption", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENCRYPTIONS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {t(e.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {needsKey ? (
            <FormField label={t("key")}>
              <Input
                type="password"
                value={form.key}
                onChange={(e) => set("key", e.target.value)}
              />
            </FormField>
          ) : null}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label className="text-sm">{t("hiddenSsid")}</Label>
            <Switch checked={form.hidden} onCheckedChange={(v) => set("hidden", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label className="text-sm">{t("radioDisabled")}</Label>
            <Switch checked={form.disabled} onCheckedChange={(v) => set("disabled", v)} />
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

function CreateNetworkDialog({
  radios,
  networks,
  onOpenChange,
}: {
  radios: string[];
  networks: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("wireless");
  const tc = useTranslations("common");
  const [device, setDevice] = useState(radios[0] ?? "");
  const [ssid, setSsid] = useState("");
  const [network, setNetwork] = useState("lan");
  const create = useCreateWifiIface();
  const reload = useReloadWireless();

  function onSubmit() {
    create.mutate(
      { device, ssid, network },
      {
        onSuccess: () => {
          reload.mutate(undefined);
          toast.success(t("createdNetwork"));
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
          <DialogTitle>{t("addNetwork")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label={t("radio")}>
            <Select value={device || "__none"} onValueChange={(v) => setDevice(v === "__none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {radios.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("ssid")}>
            <Input value={ssid} onChange={(e) => setSsid(e.target.value)} />
          </FormField>
          <FormField label={t("networkBridge")}>
            <Select value={network || "__none"} onValueChange={(v) => setNetwork(v === "__none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("unassigned")}</SelectItem>
                {networks.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={create.isPending || !device || !ssid}>
            {create.isPending ? tc("applying") : tc("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NetworkBlock({
  net,
  editable,
  onEdit,
  onDelete,
}: {
  net: WirelessNetwork;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("wireless");
  const tc = useTranslations("common");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <WifiIcon className="text-muted-foreground size-4" />
        <span className="font-medium">{net.ssid || t("noSsid")}</span>
        {net.mode ? (
          <Badge variant="outline" className="text-[0.65rem]">
            {net.mode}
          </Badge>
        ) : null}
        {net.encryption ? (
          <Badge variant="secondary" className="text-[0.65rem]">
            {net.encryption}
          </Badge>
        ) : null}
        <Badge variant={net.enabled ? "default" : "secondary"} className="text-[0.65rem]">
          {net.enabled
            ? net.channel
              ? `${t("channel")} ${net.channel}`
              : t("enabled")
            : t("disabled")}
        </Badge>
        {editable ? (
          <span className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("editNetwork")}
              aria-label={t("editNetwork")}
              onClick={onEdit}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("deleteNetwork")}
                  aria-label={t("deleteNetwork")}
                >
                  <TrashIcon className="text-destructive size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteNetwork")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteNetworkConfirm", { ssid: net.ssid || net.iface })}
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
          </span>
        ) : null}
      </div>

      <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {net.bssid ? (
          <div className="flex justify-between gap-2">
            <dt>{t("bssid")}</dt>
            <dd className="text-foreground truncate font-mono">{net.bssid}</dd>
          </div>
        ) : null}
        {net.frequency ? (
          <div className="flex justify-between gap-2">
            <dt>MHz</dt>
            <dd className="text-foreground tabular-nums">{net.frequency}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1">
            <UsersIcon className="size-3" />
            {t("stations")}
          </dt>
          <dd className="text-foreground tabular-nums">{net.stations.length}</dd>
        </div>
      </dl>

      {net.stations.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {net.stations.map((s) => (
            <li
              key={s.mac}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
            >
              <span className="font-mono">{s.mac}</span>
              <span className="text-muted-foreground flex items-center gap-3 tabular-nums">
                <span className="flex items-center gap-1">
                  <SignalIcon className="size-3" />
                  {s.signal !== undefined ? `${s.signal} dBm` : "—"}
                </span>
                {s.bitrate !== undefined ? <span>{s.bitrate} Mbit/s</span> : null}
              </span>
              <span className="text-muted-foreground hidden sm:inline" aria-hidden>
                {"•".repeat(signalBars(s.signal))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RadioCard({
  radio,
  radioConfig,
  configByRef,
  onEditRadio,
  onEditIface,
  onDeleteIface,
}: {
  radio: WirelessRadio;
  radioConfig?: RadioConfig;
  configByRef: Map<string, WifiIfaceConfig>;
  onEditRadio: () => void;
  onEditIface: (ref: string) => void;
  onDeleteIface: (ref: string) => void;
}) {
  const t = useTranslations("wireless");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {radio.name}
          <Badge variant={radio.up ? "default" : "secondary"}>
            {radio.up ? t("enabled") : t("disabled")}
          </Badge>
          {radioConfig ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              title={t("editRadio")}
              aria-label={t("editRadio")}
              onClick={onEditRadio}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="text-muted-foreground grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt>{t("channel")}</dt>
            <dd className="text-foreground tabular-nums">{radio.channel ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>MHz</dt>
            <dd className="text-foreground tabular-nums">{radio.frequency ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>dBm</dt>
            <dd className="text-foreground tabular-nums">{radio.txpower ?? "—"}</dd>
          </div>
        </dl>

        {radio.networks.length > 0 ? (
          <div className="space-y-4">
            {radio.networks.map((net, i) => (
              <div key={net.iface + i}>
                {i > 0 ? <Separator className="my-4" /> : null}
                <NetworkBlock
                  net={net}
                  editable={Boolean(net.section && configByRef.has(net.section))}
                  onEdit={() => net.section && onEditIface(net.section)}
                  onDelete={() => net.section && onDeleteIface(net.section)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">{t("noNetworks")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const t = useTranslations("wireless");
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <WifiIcon className="text-muted-foreground size-6" />
        </div>
        <div className="max-w-md">
          <p className="font-medium">{t("noWireless")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("noWirelessHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WirelessPage() {
  const t = useTranslations("wireless");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useWireless();
  const reload = useReloadWireless();
  const cfgQuery = useWirelessConfig();
  const ifacesQuery = useIfaceConfig();
  const remove = useDeleteWifiIface();
  const [editingRadio, setEditingRadio] = useState<RadioConfig | null>(null);
  const [editingIface, setEditingIface] = useState<WifiIfaceConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const radioConfigByName = new Map((cfgQuery.data?.radios ?? []).map((r) => [r.name, r]));
  const configByRef = new Map((cfgQuery.data?.ifaces ?? []).map((i) => [i.ref, i]));
  const networkNames = (ifacesQuery.data?.interfaces ?? []).map((i) => i.name);

  function onReload() {
    reload.mutate(undefined, {
      onSuccess: () => toast.success(t("reloadOk")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  // Confirmation lives in the AlertDialog wrapping each delete button; a
  // `window.confirm` here is not themeable and blocks the tab.
  function onDeleteIface(ref: string) {
    remove.mutate(ref, {
      onSuccess: () => toast.success(t("deletedNetwork")),
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreating(true)}
          disabled={(cfgQuery.data?.radios.length ?? 0) === 0}
        >
          <PlusIcon className="size-4" />
          {t("addNetwork")}
        </Button>
        <Button variant="outline" size="sm" onClick={onReload} disabled={reload.isPending}>
          <WifiIcon className="size-4" />
          {reload.isPending ? tc("applying") : tc("reload")}
        </Button>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((radio) => (
            <RadioCard
              key={radio.name}
              radio={radio}
              radioConfig={radioConfigByName.get(radio.name)}
              configByRef={configByRef}
              onEditRadio={() => setEditingRadio(radioConfigByName.get(radio.name) ?? null)}
              onEditIface={(ref) => setEditingIface(configByRef.get(ref) ?? null)}
              onDeleteIface={onDeleteIface}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}

      {editingRadio ? (
        <RadioEditDialog
          key={editingRadio.name}
          initial={editingRadio}
          onOpenChange={(open) => !open && setEditingRadio(null)}
        />
      ) : null}
      {editingIface ? (
        <IfaceEditDialog
          key={editingIface.ref}
          initial={editingIface}
          networks={networkNames}
          onOpenChange={(open) => !open && setEditingIface(null)}
        />
      ) : null}
      {creating ? (
        <CreateNetworkDialog
          radios={(cfgQuery.data?.radios ?? []).map((r) => r.name)}
          networks={networkNames}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}
