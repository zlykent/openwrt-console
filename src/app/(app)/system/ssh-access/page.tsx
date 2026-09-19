"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  useDeleteDropbear,
  useDropbear,
  useSaveDropbear,
} from "@/hooks/use-openwrt";
import type { DropbearInput, DropbearInstance } from "@/lib/openwrt/dropbear";

const EMPTY: DropbearInput = {
  enable: true,
  interface: "",
  port: "22",
  passwordAuth: true,
  rootPasswordAuth: true,
  allowBlankPassword: false,
  enableForwarding: true,
  gatewayPorts: false,
  maxAuthTries: "",
  idleTimeout: "",
  bannerFile: "",
};

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

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
    <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
      <Label className="text-xs font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function DropbearDialog({
  initial,
  onOpenChange,
}: {
  initial: DropbearInstance | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("sshAccess");
  const tc = useTranslations("common");
  const [form, setForm] = useState<DropbearInput>(
    initial
      ? {
          enable: initial.enable,
          interface: initial.interface,
          port: initial.port,
          passwordAuth: initial.passwordAuth,
          rootPasswordAuth: initial.rootPasswordAuth,
          allowBlankPassword: initial.allowBlankPassword,
          enableForwarding: initial.enableForwarding,
          gatewayPorts: initial.gatewayPorts,
          maxAuthTries: initial.maxAuthTries,
          idleTimeout: initial.idleTimeout,
          bannerFile: initial.bannerFile,
        }
      : EMPTY,
  );
  const save = useSaveDropbear();

  const set = <K extends keyof DropbearInput>(key: K, value: DropbearInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const valid = form.port.trim() === "" || /^\d+$/.test(form.port.trim());

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editInstance") : t("addInstance")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              { ref: initial?.ref, dropbear: { ...form, port: form.port.trim() } },
              {
                onSuccess: () => {
                  toast.success(t("savedInstance"));
                  onOpenChange(false);
                },
                onError: (err) => toast.error((err as Error).message),
              },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("port")}>
              <Input
                value={form.port}
                inputMode="numeric"
                placeholder="22"
                onChange={(e) => set("port", e.target.value)}
              />
            </FormField>
            <FormField label={t("interface")}>
              <Input
                value={form.interface}
                placeholder={t("interfaceAny")}
                onChange={(e) => set("interface", e.target.value)}
              />
            </FormField>
          </div>

          <div className="space-y-2">
            <ToggleRow
              label={t("enable")}
              checked={form.enable}
              onChange={(v) => set("enable", v)}
            />
            <ToggleRow
              label={t("passwordAuth")}
              checked={form.passwordAuth}
              onChange={(v) => set("passwordAuth", v)}
            />
            <ToggleRow
              label={t("rootPasswordAuth")}
              checked={form.rootPasswordAuth}
              onChange={(v) => set("rootPasswordAuth", v)}
            />
            <ToggleRow
              label={t("allowBlankPassword")}
              checked={form.allowBlankPassword}
              onChange={(v) => set("allowBlankPassword", v)}
            />
            <ToggleRow
              label={t("enableForwarding")}
              checked={form.enableForwarding}
              onChange={(v) => set("enableForwarding", v)}
            />
            <ToggleRow
              label={t("gatewayPorts")}
              checked={form.gatewayPorts}
              onChange={(v) => set("gatewayPorts", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("maxAuthTries")}>
              <Input
                value={form.maxAuthTries}
                inputMode="numeric"
                placeholder={t("default")}
                onChange={(e) => set("maxAuthTries", e.target.value)}
              />
            </FormField>
            <FormField label={t("idleTimeout")}>
              <Input
                value={form.idleTimeout}
                inputMode="numeric"
                placeholder={t("default")}
                onChange={(e) => set("idleTimeout", e.target.value)}
              />
            </FormField>
          </div>

          <FormField label={t("bannerFile")}>
            <Input
              value={form.bannerFile}
              placeholder="/etc/banner"
              onChange={(e) => set("bannerFile", e.target.value)}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={!valid || save.isPending}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SshAccessPage() {
  const t = useTranslations("sshAccess");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useDropbear();
  const remove = useDeleteDropbear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DropbearInstance | null>(null);

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditing(null);
  }

  function confirmDelete(inst: DropbearInstance) {
    if (!window.confirm(t("deleteInstanceConfirm", { port: inst.port || "22" }))) return;
    remove.mutate(inst.ref, {
      onSuccess: () => toast.success(t("deletedInstance")),
      onError: (e) => toast.error((e as Error).message),
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

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="text-muted-foreground size-4" />
            {t("instances")}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {data.instances.length}
              </Badge>
            ) : null}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="size-3.5" />
            {t("addInstance")}
          </Button>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : !data.supported ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <KeyRoundIcon className="size-6" />
              </div>
              <div className="max-w-md">
                <p className="font-medium">
                  {data.backend === "openssh" ? t("opensshTitle") : t("unsupported")}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {data.backend === "openssh" ? t("opensshHint") : t("unsupportedHint")}
                </p>
              </div>
            </div>
          ) : data.instances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("port")}</TableHead>
                  <TableHead>{t("interface")}</TableHead>
                  <TableHead>{t("passwordAuth")}</TableHead>
                  <TableHead>{t("enable")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.instances.map((inst) => (
                  <TableRow key={inst.ref}>
                    <TableCell className="font-mono text-xs font-medium">
                      {inst.port || "22"}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {inst.interface || t("interfaceAny")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inst.passwordAuth ? "secondary" : "outline"}>
                        {inst.passwordAuth ? tc("enabled") : tc("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inst.enable ? "secondary" : "outline"}>
                        {inst.enable ? tc("enabled") : tc("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(inst);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => confirmDelete(inst)}>
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noInstances")}</p>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <DropbearDialog
          key={editing?.ref ?? "new"}
          initial={editing}
          onOpenChange={handleDialogChange}
        />
      ) : null}
    </div>
  );
}
