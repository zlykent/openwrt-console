"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CableIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useDeleteSwitchVlan,
  useSaveSwitchVlan,
  useSwitch,
} from "@/hooks/use-openwrt";
import type { SwitchVlan } from "@/lib/openwrt/switch";

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function VlanDialog({
  initial,
  devices,
  portNames,
  backend,
  onOpenChange,
}: {
  initial: SwitchVlan | null;
  devices: string[];
  portNames: string[];
  backend: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("switch");
  const tc = useTranslations("common");
  const [device, setDevice] = useState(initial?.device ?? devices[0] ?? "");
  const [vlan, setVlan] = useState(initial?.vlan ?? "1");
  const [ports, setPorts] = useState<string[]>(initial?.ports ?? []);
  const [draft, setDraft] = useState("");
  const save = useSaveSwitchVlan();

  const isDsa = backend === "dsa";
  const knownDevices = devices.includes(device) || device === "" ? devices : [device, ...devices];

  function addPort(raw: string) {
    const token = raw.trim();
    if (!token) return;
    if (!ports.includes(token)) setPorts((p) => [...p, token]);
    setDraft("");
  }

  const valid = device.trim() !== "" && vlan.trim() !== "";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editVlan") : t("addVlan")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              {
                ref: initial?.ref,
                vlan: { device: device.trim(), vlan: vlan.trim(), ports },
              },
              {
                onSuccess: () => {
                  toast.success(t("savedVlan"));
                  onOpenChange(false);
                },
                onError: (err) => toast.error((err as Error).message),
              },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("device")}>
              {knownDevices.length > 0 ? (
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("device")} />
                  </SelectTrigger>
                  <SelectContent>
                    {knownDevices.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={device} onChange={(e) => setDevice(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("vlanId")}>
              <Input
                value={vlan}
                inputMode="numeric"
                placeholder="1"
                onChange={(e) => setVlan(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label={t("ports")}>
            <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
              {ports.length === 0 ? (
                <span className="text-muted-foreground px-1 py-0.5 text-xs">
                  {t("noPorts")}
                </span>
              ) : (
                ports.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1 font-mono text-xs">
                    {p}
                    <button
                      type="button"
                      className="hover:text-destructive ml-0.5"
                      onClick={() => setPorts((list) => list.filter((x) => x !== p))}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={draft}
                list="switch-ports"
                placeholder={isDsa ? "lan1:u" : "6t"}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addPort(draft);
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => addPort(draft)}>
                <PlusIcon className="size-3.5" />
                {tc("add")}
              </Button>
            </div>
            <datalist id="switch-ports">
              {portNames.map((n) => (
                <option key={n} value={isDsa ? `${n}:u` : n} />
              ))}
            </datalist>
            <p className="text-muted-foreground mt-1.5 text-xs">
              {isDsa ? t("portsHintDsa") : t("portsHintSwconfig")}
            </p>
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

export default function SwitchPage() {
  const t = useTranslations("switch");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useSwitch();
  const remove = useDeleteSwitchVlan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SwitchVlan | null>(null);

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditing(null);
  }

  function onDelete(v: SwitchVlan) {
    remove.mutate(v.ref, {
      onSuccess: () => toast.success(t("deletedVlan")),
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
            <CableIcon className="text-muted-foreground size-4" />
            {t("vlans")}
            {data?.supported ? (
              <Badge variant="outline" className="font-mono text-[0.65rem]">
                {data.backend}
              </Badge>
            ) : null}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {data.vlans.length}
              </Badge>
            ) : null}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.supported}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="size-3.5" />
            {t("addVlan")}
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
                <CableIcon className="size-6" />
              </div>
              <div className="max-w-md">
                <p className="font-medium">{t("unsupported")}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t("unsupportedHint")}</p>
              </div>
            </div>
          ) : data.vlans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("device")}</TableHead>
                  <TableHead>{t("vlanId")}</TableHead>
                  <TableHead>{t("ports")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vlans.map((v) => (
                  <TableRow key={v.ref}>
                    <TableCell className="font-mono text-xs font-medium">
                      {v.device || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="tabular-nums">
                        {v.vlan || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.ports.length === 0 ? (
                          <span className="text-muted-foreground text-xs">{t("noPorts")}</span>
                        ) : (
                          v.ports.map((p) => (
                            <Badge key={p} variant="secondary" className="font-mono text-[0.65rem]">
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tc("edit")}
                          onClick={() => {
                            setEditing(v);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={tc("delete")}>
                              <TrashIcon className="text-destructive size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("deleteVlanConfirm", { vlan: v.vlan, device: v.device })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => onDelete(v)}
                              >
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
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noVlans")}</p>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <VlanDialog
          key={editing?.ref ?? "new"}
          initial={editing}
          devices={data?.devices ?? []}
          portNames={data?.portNames ?? []}
          backend={data?.backend ?? "none"}
          onOpenChange={handleDialogChange}
        />
      ) : null}
    </div>
  );
}
