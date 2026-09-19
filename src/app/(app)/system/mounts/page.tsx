"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownToLineIcon,
  DatabaseIcon,
  HardDriveIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  Trash2Icon,
  Wand2Icon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  useDeleteMount,
  useMountAction,
  useMounts,
  useSaveFstabGlobal,
  useSaveMount,
} from "@/hooks/use-openwrt";
import type {
  BlockDevice,
  FstabGlobal,
  FstabMount,
  FstabSwap,
} from "@/lib/openwrt/types";

/** mount.lua offers these three targets; the field itself stays free-form. */
const TARGET_PRESETS: { value: string; labelKey: string }[] = [
  { value: "/opt", labelKey: "targetOpt" },
  { value: "/", labelKey: "targetRoot" },
  { value: "/overlay", labelKey: "targetOverlay" },
];

/** LuCI's Root column is derived from the target, it is not a stored option. */
function rootKind(target: string): "yes" | "overlay" | "no" {
  if (target === "/") return "yes";
  if (target === "/overlay") return "overlay";
  return "no";
}

function percentColor(pct: number) {
  if (pct >= 90) return "[&>[data-slot=progress-indicator]]:bg-destructive";
  if (pct >= 75) return "[&>[data-slot=progress-indicator]]:bg-amber-500";
  return "";
}

/**
 * LuCI resolves an entry against `block info` by UUID first, then label, then
 * device node. Matching here is case-insensitive: fstab.lua keys its device
 * table on the raw attribute *value* but looks it up with `v:lower()`, so an
 * upper-case FAT UUID such as `B85A-8468` never matches and LuCI reports the
 * partition as "not present" even though it is attached.
 */
function matchDevice(
  entry: { uuid?: string; label?: string; device?: string },
  devices: BlockDevice[],
): BlockDevice | null {
  const find = (value: string, pick: (d: BlockDevice) => string | undefined) =>
    devices.find((d) => (pick(d) ?? "").toLowerCase() === value.toLowerCase());
  if (entry.uuid) return find(entry.uuid, (d) => d.uuid) ?? null;
  if (entry.label) return find(entry.label, (d) => d.label) ?? null;
  if (entry.device) return find(entry.device, (d) => d.dev) ?? null;
  return null;
}

/** The Device column of LuCI's tables, prefixed by whichever matcher was used. */
function deviceLabel(
  entry: { uuid?: string; label?: string; device?: string },
  devices: BlockDevice[],
): { text: string; present: boolean } | null {
  const hit = matchDevice(entry, devices);
  const mb = (d: BlockDevice) => (d.sizeMb === undefined ? "" : `, ${d.sizeMb} MB`);

  if (entry.uuid) {
    return {
      text: hit ? `UUID: ${entry.uuid} (${hit.dev}${mb(hit)})` : `UUID: ${entry.uuid}`,
      present: hit !== null,
    };
  }
  if (entry.label) {
    return {
      text: hit ? `Label: ${entry.label} (${hit.dev}${mb(hit)})` : `Label: ${entry.label}`,
      present: hit !== null,
    };
  }
  if (entry.device) {
    return {
      text: hit?.sizeMb === undefined ? entry.device : `${entry.device} (${hit.sizeMb} MB)`,
      present: hit !== null,
    };
  }
  return null;
}

/**
 * LuCI's Filesystem column prefers the type `block info` actually detected over
 * the configured `fstype`, and falls back to "?" when neither is known. "?" is
 * rendered as "Automatic" here, matching the empty-fstype placeholder of the
 * editor, since `block` picks the filesystem itself when nothing is set.
 */
function fstypeLabel(
  entry: { uuid?: string; label?: string; device?: string; fstype?: string },
  devices: BlockDevice[],
): string | null {
  return matchDevice(entry, devices)?.type ?? entry.fstype ?? null;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ---- global settings ----

const GLOBAL_FLAGS: { key: keyof FstabGlobal; labelKey: string; hintKey: string }[] = [
  { key: "anonSwap", labelKey: "anonSwap", hintKey: "anonSwapHint" },
  { key: "anonMount", labelKey: "anonMount", hintKey: "anonMountHint" },
  { key: "autoSwap", labelKey: "autoSwap", hintKey: "autoSwapHint" },
  { key: "autoMount", labelKey: "autoMount", hintKey: "autoMountHint" },
  { key: "checkFs", labelKey: "checkFs", hintKey: "checkFsHint" },
];

function GlobalForm({ initial }: { initial: FstabGlobal }) {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const save = useSaveFstabGlobal();
  const [draft, setDraft] = useState<FstabGlobal>(initial);
  const dirty = GLOBAL_FLAGS.some((f) => draft[f.key] !== initial[f.key]);

  function onSave() {
    const changed: Partial<FstabGlobal> = {};
    for (const f of GLOBAL_FLAGS) {
      if (draft[f.key] !== initial[f.key]) changed[f.key] = draft[f.key];
    }
    save.mutate(changed, {
      onSuccess: () => toast.success(t("savedGlobal")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-2">
      {GLOBAL_FLAGS.map((f) => (
        <SwitchRow
          key={f.key}
          id={`global-${f.key}`}
          label={t(f.labelKey)}
          hint={t(f.hintKey)}
          checked={draft[f.key]}
          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
        />
      ))}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
          <SaveIcon className="size-4" />
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </div>
  );
}

function GlobalCard() {
  const t = useTranslations("mounts");
  const { data } = useMounts();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2Icon className="text-muted-foreground size-4" />
          {t("global")}
        </CardTitle>
        <CardDescription>{t("globalHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {data ? (
          // The key remounts the form whenever the stored state changes behind
          // its back (Generate Config, a refresh, another session). Without it
          // the draft keeps the pre-detect values, compares as dirty against the
          // new initial state, and saving would write those stale flags back.
          <GlobalForm key={JSON.stringify(data.global)} initial={data.global} />
        ) : (
          <Skeleton className="h-40 w-full rounded-lg" />
        )}
      </CardContent>
    </Card>
  );
}

// ---- mounted file systems ----

function MountedCard() {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const { data } = useMounts();
  const action = useMountAction();
  const [pending, setPending] = useState<string | null>(null);

  function onUmount(target: string) {
    setPending(target);
    action.mutate(
      { action: "umount", target },
      {
        onSuccess: () => toast.success(t("umountOk", { target })),
        onError: (e) => toast.error((e as Error).message),
        onSettled: () => setPending(null),
      },
    );
  }

  const mounts = data?.mounts ?? [];
  return (
    <Card className="min-h-0 flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveIcon className="text-muted-foreground size-4" />
          {t("mounted")}
          <Badge variant="secondary" className="tabular-nums">
            {mounts.length}
          </Badge>
        </CardTitle>
        <CardDescription>{t("mountedHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {mounts.length === 0 ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (
          <div className="contents">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("device")}</TableHead>
                  <TableHead className="text-right">{t("size")}</TableHead>
                  <TableHead className="text-right">{t("used")}</TableHead>
                  <TableHead className="text-right">{t("available")}</TableHead>
                  <TableHead className="w-40">{t("usePercent")}</TableHead>
                  <TableHead>{t("target")}</TableHead>
                  <TableHead className="w-24 text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mounts.map((m) => {
                  const pct = parseInt(m.usePercent, 10) || 0;
                  return (
                    <TableRow key={`${m.device}-${m.target}`}>
                      <TableCell className="font-mono text-xs">{m.device}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{m.size}</TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">{m.used}</TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">{m.available}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className={percentColor(pct)} />
                          <span className="w-9 text-right font-mono text-xs tabular-nums">{m.usePercent}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.target}</TableCell>
                      <TableCell className="text-right">
                        {m.umountable ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t("umount")} disabled={pending !== null}>
                                <ArrowDownToLineIcon className="size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("umount")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("umountConfirm", { target: m.target })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => onUmount(m.target)}
                                >
                                  {t("umount")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- mount entries ----

type MountDraft = {
  enabled: boolean;
  uuid: string;
  label: string;
  device: string;
  target: string;
  fstype: string;
  options: string;
  enabledFsck: boolean;
};

function MountDialog({
  entry,
  devices,
  fstypes,
  hasFsck,
  onClose,
}: {
  entry?: FstabMount;
  devices: BlockDevice[];
  fstypes: string[];
  hasFsck: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const save = useSaveMount();
  const [form, setForm] = useState<MountDraft>({
    // mount.lua leaves the Flag without o.default, so CBI starts it disabled.
    // Defaulting to enabled would mount a freshly added entry on the next apply.
    enabled: entry?.enabled ?? false,
    uuid: entry?.uuid ?? "",
    label: entry?.label ?? "",
    device: entry?.device ?? "",
    target: entry?.target ?? "",
    fstype: entry?.fstype ?? "",
    options: entry?.options ?? "",
    enabledFsck: entry?.enabledFsck ?? false,
  });
  const set = <K extends keyof MountDraft>(key: K, value: MountDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.target.trim()) {
      toast.error(tc("required"));
      return;
    }
    if (!form.uuid.trim() && !form.label.trim() && !form.device.trim()) {
      toast.error(t("needDevice"));
      return;
    }
    const body: Record<string, unknown> = {
      kind: "mount",
      target: form.target.trim(),
      uuid: form.uuid.trim(),
      label: form.label.trim(),
      device: form.device.trim(),
      fstype: form.fstype.trim(),
      options: form.options.trim(),
      enabled: form.enabled,
    };
    if (entry) body.ref = entry.ref;
    if (hasFsck) body.enabledFsck = form.enabledFsck;
    save.mutate(body, {
      onSuccess: () => {
        toast.success(t("savedMount"));
        onClose();
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? t("editMount") : t("addMount")}</DialogTitle>
          <DialogDescription>{t("fstabHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Tabs defaultValue="general">
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">{t("generalTab")}</TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1">{t("advancedTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-3">
              <SwitchRow
                id="mount-enabled"
                label={t("enableThisMount")}
                checked={form.enabled}
                onChange={(v) => set("enabled", v)}
              />
              {/* mount.lua chains the three matchers with depends(): only the
                  first unset one is offered, so a value cannot be overwritten
                  by a field the operator cannot see. */}
              <Field id="mount-uuid" label={t("uuid")} hint={t("uuidHint")}>
                <Input
                  id="mount-uuid"
                  value={form.uuid}
                  list="mount-uuid-choices"
                  placeholder={t("matchByUuid")}
                  className="font-mono text-xs"
                  onChange={(e) => set("uuid", e.target.value)}
                />
                <datalist id="mount-uuid-choices">
                  {devices
                    .filter((d) => d.uuid)
                    .map((d) => (
                      <option key={`${d.dev}-${d.uuid}`} value={d.uuid as string}>
                        {d.dev}
                        {d.sizeMb === undefined ? "" : `, ${d.sizeMb} MB`}
                      </option>
                    ))}
                </datalist>
              </Field>
              {form.uuid === "" ? (
                <Field id="mount-label" label={t("label")} hint={t("labelHint")}>
                  <Input
                    id="mount-label"
                    value={form.label}
                    list="mount-label-choices"
                    placeholder={t("matchByLabel")}
                    onChange={(e) => set("label", e.target.value)}
                  />
                  <datalist id="mount-label-choices">
                    {devices
                      .filter((d) => d.label)
                      .map((d) => (
                        <option key={`${d.dev}-${d.label}`} value={d.label as string}>
                          {d.dev}
                          {d.sizeMb === undefined ? "" : `, ${d.sizeMb} MB`}
                        </option>
                      ))}
                  </datalist>
                </Field>
              ) : null}
              {form.uuid === "" && form.label === "" ? (
                <Field id="mount-device" label={t("device")} hint={t("deviceHint")}>
                  <Input
                    id="mount-device"
                    value={form.device}
                    list="mount-device-choices"
                    placeholder={t("matchByDevice")}
                    className="font-mono text-xs"
                    onChange={(e) => set("device", e.target.value)}
                  />
                  <datalist id="mount-device-choices">
                    {devices.map((d) => (
                      <option key={d.dev} value={d.dev}>
                        {d.sizeMb === undefined ? "" : `${d.sizeMb} MB`}
                      </option>
                    ))}
                  </datalist>
                </Field>
              ) : null}
              <Field id="mount-target" label={t("target")} hint={t("targetHint")}>
                <Input
                  id="mount-target"
                  value={form.target}
                  list="mount-target-choices"
                  placeholder="/mnt/data"
                  className="font-mono text-xs"
                  onChange={(e) => set("target", e.target.value)}
                />
                <datalist id="mount-target-choices">
                  {TARGET_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.labelKey)}
                    </option>
                  ))}
                </datalist>
              </Field>
              {form.target === "/" ? (
                <div className="bg-muted/50 space-y-1 rounded-lg border p-3">
                  <p className="text-xs font-medium">{t("rootNoticeTitle")}</p>
                  <p className="text-muted-foreground text-xs">{t("rootNotice")}</p>
                  <pre className="overflow-x-auto font-mono text-[0.7rem] leading-relaxed">
{`mkdir -p /tmp/introot
mkdir -p /tmp/extroot
mount --bind / /tmp/introot
mount /dev/sda1 /tmp/extroot
tar -C /tmp/introot -cvf - . | tar -C /tmp/extroot -xf -
umount /tmp/introot
umount /tmp/extroot`}
                  </pre>
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="advanced" className="space-y-3">
              <Field id="mount-fstype" label={t("fstype")} hint={t("fstypeHint")}>
                <Input
                  id="mount-fstype"
                  value={form.fstype}
                  list="mount-fstype-choices"
                  placeholder={t("fstypeAuto")}
                  className="font-mono text-xs"
                  onChange={(e) => set("fstype", e.target.value)}
                />
                <datalist id="mount-fstype-choices">
                  {fstypes.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Field>
              <Field id="mount-options" label={t("optionsField")} hint={t("optionsHint")}>
                <Input
                  id="mount-options"
                  value={form.options}
                  placeholder="defaults"
                  className="font-mono text-xs"
                  onChange={(e) => set("options", e.target.value)}
                />
              </Field>
              {hasFsck ? (
                <SwitchRow
                  id="mount-fsck"
                  label={t("fsck")}
                  hint={t("fsckHint")}
                  checked={form.enabledFsck}
                  onChange={(v) => set("enabledFsck", v)}
                />
              ) : null}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MountPointsCard() {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const { data } = useMounts();
  const del = useDeleteMount();
  const [editing, setEditing] = useState<FstabMount | "new" | null>(null);

  const entries = data?.fstab ?? [];
  const devices = data?.devices ?? [];

  function onDelete(ref: string) {
    del.mutate(ref, {
      onSuccess: () => toast.success(t("deletedMount")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Card className="min-h-0 flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("fstab")}
          <Badge variant="secondary" className="tabular-nums">
            {entries.length}
          </Badge>
        </CardTitle>
        <CardDescription>{t("fstabHint")}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")} disabled={!data}>
            <PlusIcon className="size-4" />
            {tc("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {!data ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("noFstab")}</p>
        ) : (
          <div className="contents">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc("enabled")}</TableHead>
                  <TableHead>{t("device")}</TableHead>
                  <TableHead>{t("target")}</TableHead>
                  <TableHead>{t("fstype")}</TableHead>
                  <TableHead>{t("options")}</TableHead>
                  <TableHead>{t("root")}</TableHead>
                  {/* fstab.lua renders this column unconditionally, even where
                      mount.lua hides the flag for want of e2fsck. */}
                  <TableHead>{t("check")}</TableHead>
                  <TableHead className="w-24 text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((m) => {
                  const resolved = deviceLabel(m, devices);
                  const kind = rootKind(m.target);
                  return (
                    <TableRow key={m.ref}>
                      <TableCell>
                        <Badge variant={m.enabled ? "default" : "secondary"} className="text-[0.65rem]">
                          {m.enabled ? tc("yes") : tc("no")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {resolved ? (
                          <span className="flex items-center gap-1.5">
                            {resolved.text}
                            {resolved.present ? null : (
                              <Badge variant="outline" className="text-[0.6rem]">
                                {t("notPresent")}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">
                        {kind === "overlay" ? "/overlay" : m.target || "?"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {fstypeLabel(m, devices) ?? t("fstypeAuto")}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {m.options || "defaults"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {kind === "no" ? tc("no") : kind === "yes" ? tc("yes") : t("rootOverlay")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {m.enabledFsck ? tc("yes") : tc("no")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={tc("edit")}
                            onClick={() => setEditing(m)}
                          >
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
                                <AlertDialogDescription>{m.target}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => onDelete(m.ref)}>
                                  {tc("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {editing && data ? (
        <MountDialog
          entry={editing === "new" ? undefined : editing}
          devices={devices}
          fstypes={data.fstypes}
          hasFsck={data.hasFsck}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

// ---- swap entries ----

type SwapDraft = { enabled: boolean; device: string; uuid: string; label: string };

function SwapDialog({
  entry,
  devices,
  onClose,
}: {
  entry?: FstabSwap;
  devices: BlockDevice[];
  onClose: () => void;
}) {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const save = useSaveMount();
  const [form, setForm] = useState<SwapDraft>({
    // swap.lua leaves the Flag without o.default as well.
    enabled: entry?.enabled ?? false,
    device: entry?.device ?? "",
    uuid: entry?.uuid ?? "",
    label: entry?.label ?? "",
  });
  const set = <K extends keyof SwapDraft>(key: K, value: SwapDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.device.trim() && !form.uuid.trim() && !form.label.trim()) {
      toast.error(t("needDevice"));
      return;
    }
    const body: Record<string, unknown> = {
      kind: "swap",
      device: form.device.trim(),
      uuid: form.uuid.trim(),
      label: form.label.trim(),
      enabled: form.enabled,
    };
    if (entry) body.ref = entry.ref;
    save.mutate(body, {
      onSuccess: () => {
        toast.success(t("savedSwap"));
        onClose();
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? t("editSwap") : t("addSwap")}</DialogTitle>
          <DialogDescription>{t("swapHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Tabs defaultValue="general">
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">{t("generalTab")}</TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1">{t("advancedTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-3">
              <SwitchRow
                id="swap-enabled"
                label={t("enableThisSwap")}
                checked={form.enabled}
                onChange={(v) => set("enabled", v)}
              />
              <Field id="swap-device" label={t("device")} hint={t("deviceHint")}>
                <Input
                  id="swap-device"
                  value={form.device}
                  list="swap-device-choices"
                  placeholder="/dev/sda1"
                  className="font-mono text-xs"
                  onChange={(e) => set("device", e.target.value)}
                />
                <datalist id="swap-device-choices">
                  {devices.map((d) => (
                    <option key={d.dev} value={d.dev}>
                      {d.sizeMb === undefined ? "" : `${d.sizeMb} MB`}
                    </option>
                  ))}
                </datalist>
              </Field>
            </TabsContent>
            <TabsContent value="advanced" className="space-y-3">
              <Field id="swap-uuid" label={t("uuid")} hint={t("uuidHint")}>
                <Input
                  id="swap-uuid"
                  value={form.uuid}
                  placeholder={t("matchByUuid")}
                  className="font-mono text-xs"
                  onChange={(e) => set("uuid", e.target.value)}
                />
              </Field>
              <Field id="swap-label" label={t("label")} hint={t("labelHint")}>
                <Input
                  id="swap-label"
                  value={form.label}
                  placeholder={t("matchByLabel")}
                  onChange={(e) => set("label", e.target.value)}
                />
              </Field>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwapCard() {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const { data } = useMounts();
  const del = useDeleteMount();
  const [editing, setEditing] = useState<FstabSwap | "new" | null>(null);

  const entries = data?.swap ?? [];
  const devices = data?.swapDevices ?? [];

  function onDelete(ref: string) {
    del.mutate(ref, {
      onSuccess: () => toast.success(t("deletedSwap")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Card className="min-h-0 flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseIcon className="text-muted-foreground size-4" />
          {t("swap")}
          <Badge variant="secondary" className="tabular-nums">
            {entries.length}
          </Badge>
        </CardTitle>
        <CardDescription>{t("swapHint")}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")} disabled={!data}>
            <PlusIcon className="size-4" />
            {tc("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {!data ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("noSwap")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("enabled")}</TableHead>
                <TableHead>{t("device")}</TableHead>
                <TableHead className="w-24 text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((s) => {
                const resolved = deviceLabel(s, data.devices);
                return (
                  <TableRow key={s.ref}>
                    <TableCell>
                      <Badge variant={s.enabled ? "default" : "secondary"} className="text-[0.65rem]">
                        {s.enabled ? tc("yes") : tc("no")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {resolved ? (
                        <span className="flex items-center gap-1.5">
                          {resolved.text}
                          {resolved.present ? null : (
                            <Badge variant="outline" className="text-[0.6rem]">
                              {t("notPresent")}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tc("edit")}
                          onClick={() => setEditing(s)}
                        >
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
                              <AlertDialogDescription>{resolved?.text ?? s.ref}</AlertDialogDescription>
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
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {editing && data ? (
        <SwapDialog
          entry={editing === "new" ? undefined : editing}
          devices={devices}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

// ---- page ----

export default function MountsPage() {
  const t = useTranslations("mounts");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useMounts();
  const action = useMountAction();

  function onApply() {
    action.mutate(
      { action: "apply" },
      {
        onSuccess: (r) => toast.success(r.output ? `${t("applyOk")}: ${r.output}` : t("applyOk")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onDetect() {
    action.mutate(
      { action: "detect" },
      {
        onSuccess: () => toast.success(t("detectOk")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onApply}
          disabled={action.isPending || data?.supported === false}
          title={t("applyHint")}
        >
          <PlayIcon className="size-4" />
          {t("apply")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={action.isPending || data?.supported === false}
              title={t("generateConfigHint")}
            >
              <Wand2Icon className="size-4" />
              {t("generateConfig")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("generateConfig")}</AlertDialogTitle>
              <AlertDialogDescription>{t("generateConfigHint")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDetect}>
                {t("generateConfig")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : !data.supported ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{t("unsupported")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <GlobalCard />
          <MountedCard />
          <MountPointsCard />
          <SwapCard />
        </div>
      )}
    </div>
  );
}
