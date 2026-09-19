"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { GitBranchIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useDeleteRoute, useInterfaces, useRoutes, useSaveRoute } from "@/hooks/use-openwrt";
import type { StaticRoute } from "@/lib/openwrt/types";

type FormState = {
  ref?: string;
  kind: "route" | "route6";
  name: string;
  iface: string;
  target: string;
  netmask: string;
  gateway: string;
  metric: string;
  mtu: string;
  type: string;
  enabled: boolean;
};

const EMPTY: FormState = {
  kind: "route",
  name: "",
  iface: "",
  target: "",
  netmask: "",
  gateway: "",
  metric: "",
  mtu: "",
  type: "",
  enabled: true,
};

/**
 * Route classes LuCI offers, in its order. `unicast` is the empty value there
 * and stays empty here, so the default route writes no `type` option.
 */
const ROUTE_TYPES = [
  "local",
  "broadcast",
  "multicast",
  "unreachable",
  "prohibit",
  "blackhole",
  "anycast",
  "throw",
];

/** shadcn's Select rejects an empty item value. */
const UNICAST = "__unicast__";

function fromRoute(r: StaticRoute): FormState {
  return {
    ref: r.ref,
    kind: r.kind,
    name: r.name ?? "",
    iface: r.iface,
    target: r.target,
    netmask: r.netmask ?? "",
    gateway: r.gateway ?? "",
    metric: r.metric ?? "",
    mtu: r.mtu ?? "",
    type: r.type ?? "",
    enabled: r.enabled,
  };
}

export default function RoutesPage() {
  const t = useTranslations("routes");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useRoutes();
  const { data: ifaces } = useInterfaces();
  const save = useSaveRoute();
  const del = useDeleteRoute();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  // Routes reference a UCI interface name, so offer the device's interfaces
  // instead of free text; keep an unknown stored value selectable.
  const ifaceNames = useMemo(() => {
    const names = (ifaces ?? []).map((i) => i.name);
    if (form.iface && !names.includes(form.iface)) names.unshift(form.iface);
    return names;
  }, [ifaces, form.iface]);

  // A stored type outside LuCI's list (hand-written config) must stay visible
  // and selectable instead of silently resetting to unicast on save.
  const routeTypes = useMemo(() => {
    const types = [...ROUTE_TYPES];
    if (form.type && !types.includes(form.type)) types.unshift(form.type);
    return types;
  }, [form.type]);

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(r: StaticRoute) {
    setForm(fromRoute(r));
    setOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.iface.trim() || !form.target.trim()) {
      toast.error(tc("required"));
      return;
    }
    const body: Record<string, unknown> = {
      kind: form.kind,
      iface: form.iface.trim(),
      target: form.target.trim(),
      enabled: form.enabled,
    };
    if (form.ref) body.ref = form.ref;
    if (form.name.trim()) body.name = form.name.trim();
    if (form.netmask.trim()) body.netmask = form.netmask.trim();
    if (form.gateway.trim()) body.gateway = form.gateway.trim();
    if (form.metric.trim()) body.metric = form.metric.trim();
    if (form.mtu.trim()) body.mtu = form.mtu.trim();
    if (form.type.trim()) body.type = form.type.trim();
    save.mutate(body, {
      onSuccess: () => {
        toast.success(t("saved"));
        setOpen(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function onDelete(ref: string) {
    del.mutate(ref, {
      onSuccess: () => toast.success(t("deleted")),
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Static routes (editable) */}
          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranchIcon className="text-muted-foreground size-4" />
                {t("static")}
                <Badge variant="secondary" className="tabular-nums">
                  {data.static.length}
                </Badge>
              </CardTitle>
              <CardAction>
                <Button size="sm" onClick={openNew}>
                  <PlusIcon className="size-4" />
                  {tc("add")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {data.static.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tc("name")}</TableHead>
                      <TableHead>{t("kind")}</TableHead>
                      <TableHead>{t("interface")}</TableHead>
                      <TableHead>{t("target")}</TableHead>
                      <TableHead>{t("gateway")}</TableHead>
                      <TableHead>{t("mtu")}</TableHead>
                      <TableHead className="text-right">{tc("enabled")}</TableHead>
                      <TableHead className="w-16 text-right">{tc("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.static.map((r) => (
                      <TableRow key={r.ref}>
                        <TableCell className="font-medium">
                          {r.name || <span className="text-muted-foreground font-mono text-xs">{r.ref}</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[0.65rem]">
                            {r.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.iface}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.type ? (
                            <Badge variant="outline" className="mr-1 text-[0.65rem]">
                              {r.type}
                            </Badge>
                          ) : null}
                          {r.target || <span className="text-muted-foreground">—</span>}
                          {r.netmask ? ` / ${r.netmask}` : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {r.gateway || "—"}
                          {r.metric ? ` (m${r.metric})` : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {r.mtu || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={r.enabled ? "default" : "secondary"} className="text-[0.65rem]">
                            {r.enabled ? tc("yes") : tc("no")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)} aria-label={tc("edit")}>
                              <PencilIcon className="size-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={tc("delete")}>
                                  <Trash2Icon className="text-destructive size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {r.name || r.ref} · {r.target}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                  <AlertDialogAction variant="destructive" onClick={() => onDelete(r.ref)}>
                                    {tc("delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("noStatic")}</p>
              )}
            </CardContent>
          </Card>

          {/* Active routes (read-only kernel table) */}
          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("active")}
                <Badge variant="secondary" className="tabular-nums">
                  {data.active.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {data.active.length > 0 ? (
                <div className="contents">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("target")}</TableHead>
                        <TableHead>{t("gateway")}</TableHead>
                        <TableHead>{t("device")}</TableHead>
                        <TableHead>{t("proto")}</TableHead>
                        <TableHead>{t("scope")}</TableHead>
                        <TableHead>{t("metric")}</TableHead>
                        <TableHead>{t("source")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.active.map((r, i) => (
                        <TableRow key={`${r.target}-${i}`}>
                          <TableCell className="font-mono text-xs font-medium">
                            {r.type ? (
                              <Badge variant="outline" className="mr-1 text-[0.65rem]">
                                {r.type}
                              </Badge>
                            ) : null}
                            {r.target || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{r.gateway || "—"}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{r.device || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{r.proto || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{r.scope || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs tabular-nums">{r.metric || "—"}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{r.source || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("noActive")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add / edit static route */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.ref ? t("editRoute") : t("addRoute")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kind">{t("kind")}</Label>
                <Select value={form.kind} onValueChange={(v) => set("kind", v as FormState["kind"])}>
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="route">route (IPv4)</SelectItem>
                    <SelectItem value="route6">route6 (IPv6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iface">{t("interface")}</Label>
                <Select value={form.iface} onValueChange={(v) => set("iface", v)}>
                  <SelectTrigger id="iface">
                    <SelectValue placeholder={t("ifacePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ifaceNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rtarget">{t("target")}</Label>
              <Input
                id="rtarget"
                value={form.target}
                onChange={(e) => set("target", e.target.value)}
                placeholder={form.kind === "route6" ? "2001:db8::/32" : "192.168.2.0/24"}
                className="font-mono"
              />
            </div>
            {form.kind === "route" ? (
              <div className="space-y-1.5">
                <Label htmlFor="netmask">{t("netmask")}</Label>
                <Input id="netmask" value={form.netmask} onChange={(e) => set("netmask", e.target.value)} placeholder="255.255.255.0" className="font-mono" />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gw">{t("gateway")}</Label>
                <Input id="gw" value={form.gateway} onChange={(e) => set("gateway", e.target.value)} placeholder="192.168.1.1" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric">{t("metric")}</Label>
                <Input id="metric" value={form.metric} onChange={(e) => set("metric", e.target.value)} placeholder="0" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rtype">{t("type")}</Label>
                <Select
                  value={form.type ? form.type : UNICAST}
                  onValueChange={(v) => set("type", v === UNICAST ? "" : v)}
                >
                  <SelectTrigger id="rtype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNICAST}>unicast</SelectItem>
                    {routeTypes.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {rt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mtu">{t("mtu")}</Label>
                <Input
                  id="mtu"
                  value={form.mtu}
                  onChange={(e) => set("mtu", e.target.value)}
                  placeholder="1500"
                  inputMode="numeric"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rname">{tc("name")}</Label>
              <Input id="rname" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="renabled" className="cursor-pointer">
                {tc("enabled")}
              </Label>
              <Switch id="renabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
