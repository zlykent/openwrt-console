"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  LightbulbIcon,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteLed, useLeds, useSaveLed } from "@/hooks/use-openwrt";
import type { LedInput, LedSection } from "@/lib/openwrt/leds";

const NETDEV_MODES = ["link", "tx", "rx"] as const;
const NONE = "__none";

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

const EMPTY: LedInput = {
  name: "",
  sysfs: "",
  trigger: "none",
  dev: "",
  mode: "",
  delayon: "",
  delayoff: "",
  default: false,
};

function LedDialog({
  initial,
  sysfsNames,
  triggers,
  onOpenChange,
}: {
  initial: LedSection | null;
  sysfsNames: string[];
  triggers: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("leds");
  const tc = useTranslations("common");
  const [form, setForm] = useState<LedInput>(
    initial
      ? {
          name: initial.name,
          sysfs: initial.sysfs,
          trigger: initial.trigger || "none",
          dev: initial.dev,
          mode: initial.mode,
          delayon: initial.delayon,
          delayoff: initial.delayoff,
          default: initial.default,
        }
      : EMPTY,
  );
  const save = useSaveLed();

  const set = <K extends keyof LedInput>(key: K, value: LedInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const modes = form.mode.split(/\s+/).filter(Boolean);
  const toggleMode = (m: string, on: boolean) =>
    set(
      "mode",
      (on ? [...modes, m] : modes.filter((x) => x !== m)).join(" "),
    );

  const isNetdev = form.trigger === "netdev";
  const isTimer = form.trigger === "timer";
  const valid = form.name.trim() !== "" && form.sysfs.trim() !== "";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editLed") : t("addLed")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              { ref: initial?.ref, led: { ...form, name: form.name.trim(), sysfs: form.sysfs.trim() } },
              {
                onSuccess: () => {
                  toast.success(t("savedLed"));
                  onOpenChange(false);
                },
                onError: (err) => toast.error((err as Error).message),
              },
            );
          }}
        >
          <FormField label={t("ledName")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField label={t("sysfs")}>
            <Input
              value={form.sysfs}
              list="led-sysfs"
              placeholder="tp-link:green:wan"
              onChange={(e) => set("sysfs", e.target.value)}
            />
            <datalist id="led-sysfs">
              {sysfsNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </FormField>
          <FormField label={t("trigger")}>
            <Select value={form.trigger || NONE} onValueChange={(v) => set("trigger", v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("triggerNone")}</SelectItem>
                {triggers.map((tr) => (
                  <SelectItem key={tr} value={tr}>
                    {tr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {isNetdev ? (
            <>
              <FormField label={t("device")}>
                <Input
                  value={form.dev}
                  placeholder="eth0"
                  onChange={(e) => set("dev", e.target.value)}
                />
              </FormField>
              <FormField label={t("mode")}>
                <div className="flex gap-4">
                  {NETDEV_MODES.map((m) => (
                    <label key={m} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={modes.includes(m)}
                        onCheckedChange={(on) => toggleMode(m, on === true)}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </FormField>
            </>
          ) : null}

          {isTimer ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("delayOn")}>
                <Input
                  value={form.delayon}
                  placeholder="100"
                  onChange={(e) => set("delayon", e.target.value)}
                />
              </FormField>
              <FormField label={t("delayOff")}>
                <Input
                  value={form.delayoff}
                  placeholder="100"
                  onChange={(e) => set("delayoff", e.target.value)}
                />
              </FormField>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label className="text-xs">{t("defaultOn")}</Label>
            <Switch checked={form.default} onCheckedChange={(v) => set("default", v)} />
          </div>

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

export default function LedsPage() {
  const t = useTranslations("leds");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useLeds();
  const remove = useDeleteLed();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedSection | null>(null);

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditing(null);
  }

  function confirmDelete(led: LedSection) {
    if (!window.confirm(t("deleteLedConfirm", { name: led.name || led.sysfs }))) return;
    remove.mutate(led.ref, {
      onSuccess: () => toast.success(t("deletedLed")),
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
            <LightbulbIcon className="text-muted-foreground size-4" />
            {t("configuredLeds")}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {data.sections.length}
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
            {t("addLed")}
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
                <LightbulbIcon className="size-6" />
              </div>
              <div className="max-w-md">
                <p className="font-medium">{t("unsupported")}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t("unsupportedHint")}</p>
              </div>
            </div>
          ) : data.sections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ledName")}</TableHead>
                  <TableHead>{t("sysfs")}</TableHead>
                  <TableHead>{t("trigger")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sections.map((led) => (
                  <TableRow key={led.ref}>
                    <TableCell className="font-medium">{led.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {led.sysfs}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[0.65rem]">
                        {led.trigger || t("triggerNone")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(led);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => confirmDelete(led)}>
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noLeds")}</p>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <LedDialog
          key={editing?.ref ?? "new"}
          initial={editing}
          sysfsNames={data?.sysfsNames ?? []}
          triggers={data?.triggers ?? []}
          onOpenChange={handleDialogChange}
        />
      ) : null}
    </div>
  );
}
