"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CloudIcon, GlobeIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { useDeleteDdns, useDdns, useSaveDdns } from "@/hooks/use-openwrt";
import type { DdnsService } from "@/lib/openwrt/types";

type FormState = {
  ref?: string;
  name: string;
  enabled: boolean;
  serviceName: string;
  lookupHost: string;
  domain: string;
  username: string;
  useIpv6: boolean;
  checkInterval: string;
  forceInterval: string;
  ipSource: string;
  updateUrl: string;
};

const EMPTY: FormState = {
  name: "",
  enabled: true,
  serviceName: "",
  lookupHost: "",
  domain: "",
  username: "",
  useIpv6: false,
  checkInterval: "10",
  forceInterval: "72",
  ipSource: "network",
  updateUrl: "",
};

function fromService(s: DdnsService): FormState {
  return {
    ref: s.ref,
    name: s.name,
    enabled: s.enabled,
    serviceName: s.serviceName ?? "",
    lookupHost: s.lookupHost ?? "",
    domain: s.domain ?? "",
    username: s.username ?? "",
    useIpv6: s.useIpv6,
    checkInterval: s.checkInterval ?? "",
    forceInterval: s.forceInterval ?? "",
    ipSource: s.ipSource ?? "",
    updateUrl: s.updateUrl ?? "",
  };
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 last:border-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-right font-mono text-sm">{value || "—"}</dd>
    </div>
  );
}

export default function DdnsPage() {
  const t = useTranslations("ddns");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useDdns();
  const save = useSaveDdns();
  const del = useDeleteDdns();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(s: DdnsService) {
    setForm(fromService(s));
    setOpen(true);
  }
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(tc("required"));
      return;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      enabled: form.enabled,
      useIpv6: form.useIpv6,
    };
    if (form.ref) body.ref = form.ref;
    if (form.serviceName.trim()) body.serviceName = form.serviceName.trim();
    if (form.lookupHost.trim()) body.lookupHost = form.lookupHost.trim();
    if (form.domain.trim()) body.domain = form.domain.trim();
    if (form.username.trim()) body.username = form.username.trim();
    if (form.checkInterval.trim()) body.checkInterval = form.checkInterval.trim();
    if (form.forceInterval.trim()) body.forceInterval = form.forceInterval.trim();
    if (form.ipSource.trim()) body.ipSource = form.ipSource.trim();
    if (form.updateUrl.trim()) body.updateUrl = form.updateUrl.trim();
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
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Global settings (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GlobeIcon className="text-muted-foreground size-4" />
                {t("global")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <InfoRow label={t("dateFormat")} value={data.global.dateFormat} />
                <InfoRow label={t("logLines")} value={data.global.logLines} />
                <InfoRow label={t("updatePrivateIp")} value={data.global.updatePrivateIp ? tc("yes") : tc("no")} />
              </dl>
            </CardContent>
          </Card>

          {/* Services (CRUD) */}
          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudIcon className="text-muted-foreground size-4" />
                {t("services")}
                <Badge variant="secondary" className="tabular-nums">
                  {data.services.length}
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
              {data.services.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tc("name")}</TableHead>
                      <TableHead>{t("provider")}</TableHead>
                      <TableHead>{t("lookupHost")}</TableHead>
                      <TableHead>{t("domain")}</TableHead>
                      <TableHead className="text-right">{tc("enabled")}</TableHead>
                      <TableHead className="w-16 text-right">{tc("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.services.map((s) => (
                      <TableRow key={s.ref}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{s.serviceName || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.lookupHost || "—"}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{s.domain || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.enabled ? "default" : "secondary"} className="text-[0.65rem]">
                            {s.enabled ? tc("yes") : tc("no")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon-sm" title={tc("edit")} onClick={() => openEdit(s)}>
                              <PencilIcon className="size-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon-sm" title={tc("delete")}>
                                  <Trash2Icon className="text-destructive size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                                  <AlertDialogDescription>{s.name}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                  <AlertDialogAction variant="destructive" onClick={() => onDelete(s.ref)}>
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
                <p className="text-muted-foreground py-8 text-center text-sm">{t("noServices")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add / edit service */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.ref ? t("editService") : t("addService")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dname">{tc("name")}</Label>
                <Input id="dname" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="myddns" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dprovider">{t("provider")}</Label>
                <Select value={form.serviceName} onValueChange={(v) => set("serviceName", v)}>
                  <SelectTrigger id="dprovider">
                    <SelectValue placeholder={t("providerPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.providers.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dlookup">{t("lookupHost")}</Label>
                <Input id="dlookup" value={form.lookupHost} onChange={(e) => set("lookupHost", e.target.value)} placeholder="host.example.com" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ddomain">{t("domain")}</Label>
                <Input id="ddomain" value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="example.com" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="duser">{t("username")}</Label>
                <Input id="duser" value={form.username} onChange={(e) => set("username", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dipsource">{t("ipSource")}</Label>
                <Input id="dipsource" value={form.ipSource} onChange={(e) => set("ipSource", e.target.value)} placeholder="network" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dcheck">{t("checkInterval")}</Label>
                <Input id="dcheck" value={form.checkInterval} onChange={(e) => set("checkInterval", e.target.value)} placeholder="10" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dforce">{t("forceInterval")}</Label>
                <Input id="dforce" value={form.forceInterval} onChange={(e) => set("forceInterval", e.target.value)} placeholder="72" className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durl">{t("updateUrl")}</Label>
              <Input id="durl" value={form.updateUrl} onChange={(e) => set("updateUrl", e.target.value)} placeholder={t("updateUrlPlaceholder")} className="font-mono" />
            </div>
            <div className="flex flex-wrap items-center gap-6 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
                {tc("enabled")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.useIpv6} onCheckedChange={(v) => set("useIpv6", v)} />
                {t("useIpv6")}
              </label>
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
