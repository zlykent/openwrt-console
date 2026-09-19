"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { NetworkIcon, PlusIcon, RefreshCwIcon, SaveIcon, Trash2Icon } from "lucide-react";
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
import {
  useAddUpnpRule,
  useDeleteUpnpRule,
  useSaveUpnpConfig,
  useUpnp,
} from "@/hooks/use-openwrt";
import type { UpnpConfig } from "@/lib/openwrt/types";

type RuleForm = {
  action: "allow" | "deny";
  extPorts: string;
  intAddr: string;
  intPorts: string;
  comment: string;
};

const EMPTY_RULE: RuleForm = {
  action: "allow",
  extPorts: "",
  intAddr: "",
  intPorts: "",
  comment: "",
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function UpnpPage() {
  const t = useTranslations("upnp");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useUpnp();
  const saveConfig = useSaveUpnpConfig();
  const addRule = useAddUpnpRule();
  const delRule = useDeleteUpnpRule();

  const [config, setConfig] = useState<UpnpConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<RuleForm>(EMPTY_RULE);

  useEffect(() => {
    if (data) setConfig(data.config);
  }, [data]);

  function setConfigField<K extends keyof UpnpConfig>(key: K, value: UpnpConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  }

  const dirty =
    config && data
      ? (Object.keys(data.config) as (keyof UpnpConfig)[]).some(
          (k) => config[k] !== data.config[k],
        )
      : false;

  function onSaveConfig() {
    if (!config) return;
    saveConfig.mutate(config, {
      onSuccess: () => toast.success(t("saved")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  function onAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!rule.extPorts.trim() || !rule.intAddr.trim() || !rule.intPorts.trim()) {
      toast.error(tc("required"));
      return;
    }
    const body: Record<string, unknown> = {
      action: rule.action,
      extPorts: rule.extPorts.trim(),
      intAddr: rule.intAddr.trim(),
      intPorts: rule.intPorts.trim(),
    };
    if (rule.comment.trim()) body.comment = rule.comment.trim();
    addRule.mutate(body, {
      onSuccess: () => {
        toast.success(t("ruleAdded"));
        setOpen(false);
        setRule(EMPTY_RULE);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function onDeleteRule(ref: string) {
    delRule.mutate(ref, {
      onSuccess: () => toast.success(t("ruleDeleted")),
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
      ) : isLoading || !data || !config ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Config */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NetworkIcon className="text-muted-foreground size-4" />
                {t("config")}
              </CardTitle>
              <CardAction>
                <Button size="sm" onClick={onSaveConfig} disabled={!dirty || saveConfig.isPending}>
                  <SaveIcon className="size-4" />
                  {saveConfig.isPending ? tc("saving") : tc("save")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ToggleRow label={t("enabled")} checked={config.enabled} onChange={(v) => setConfigField("enabled", v)} />
                <ToggleRow label={t("enableNatpmp")} checked={config.enableNatpmp} onChange={(v) => setConfigField("enableNatpmp", v)} />
                <ToggleRow label={t("enableUpnp")} checked={config.enableUpnp} onChange={(v) => setConfigField("enableUpnp", v)} />
                <ToggleRow label={t("secureMode")} checked={config.secureMode} onChange={(v) => setConfigField("secureMode", v)} />
                <ToggleRow label={t("logOutput")} checked={config.logOutput} onChange={(v) => setConfigField("logOutput", v)} />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="up-download">{t("download")}</Label>
                  <Input id="up-download" value={config.download} onChange={(e) => setConfigField("download", e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="up-upload">{t("upload")}</Label>
                  <Input id="up-upload" value={config.upload} onChange={(e) => setConfigField("upload", e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="up-iface">{t("internalIface")}</Label>
                  <Input id="up-iface" value={config.internalIface} onChange={(e) => setConfigField("internalIface", e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="up-port">{t("port")}</Label>
                  <Input id="up-port" value={config.port} onChange={(e) => setConfigField("port", e.target.value)} className="font-mono" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permission rules */}
          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("rules")}
                <Badge variant="secondary" className="tabular-nums">
                  {data.rules.length}
                </Badge>
              </CardTitle>
              <CardAction>
                <Button size="sm" onClick={() => setOpen(true)}>
                  <PlusIcon className="size-4" />
                  {tc("add")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {data.rules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("action")}</TableHead>
                      <TableHead>{t("extPorts")}</TableHead>
                      <TableHead>{t("intAddr")}</TableHead>
                      <TableHead>{t("intPorts")}</TableHead>
                      <TableHead>{t("comment")}</TableHead>
                      <TableHead className="w-10 text-right">{tc("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rules.map((r) => (
                      <TableRow key={r.ref}>
                        <TableCell>
                          <Badge variant={r.action === "allow" ? "default" : "destructive"} className="text-[0.65rem]">
                            {r.action === "allow" ? t("allow") : t("deny")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.extPorts}</TableCell>
                        <TableCell className="font-mono text-xs">{r.intAddr}</TableCell>
                        <TableCell className="font-mono text-xs">{r.intPorts}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.comment || "—"}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <Trash2Icon className="text-destructive size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {r.extPorts} → {r.intAddr}:{r.intPorts}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => onDeleteRule(r.ref)}>
                                  {tc("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("noRules")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add rule */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addRule")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onAddRule} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="raction">{t("action")}</Label>
              <Select value={rule.action} onValueChange={(v) => setRule((r) => ({ ...r, action: v as RuleForm["action"] }))}>
                <SelectTrigger id="raction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">{t("allow")}</SelectItem>
                  <SelectItem value="deny">{t("deny")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rext">{t("extPorts")}</Label>
                <Input id="rext" value={rule.extPorts} onChange={(e) => setRule((r) => ({ ...r, extPorts: e.target.value }))} placeholder="8080" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rintports">{t("intPorts")}</Label>
                <Input id="rintports" value={rule.intPorts} onChange={(e) => setRule((r) => ({ ...r, intPorts: e.target.value }))} placeholder="80" className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rintaddr">{t("intAddr")}</Label>
              <Input id="rintaddr" value={rule.intAddr} onChange={(e) => setRule((r) => ({ ...r, intAddr: e.target.value }))} placeholder="192.168.1.100" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rcomment">{t("comment")}</Label>
              <Input id="rcomment" value={rule.comment} onChange={(e) => setRule((r) => ({ ...r, comment: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={addRule.isPending}>
                {addRule.isPending ? tc("saving") : tc("add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
