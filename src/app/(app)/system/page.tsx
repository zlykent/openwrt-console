"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  InfoIcon,
  KeyIcon,
  PowerIcon,
  SaveIcon,
  SettingsIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  useBoard,
  useChangePassword,
  useReboot,
  useSettings,
  useSystemInfo,
  useTimezones,
  useUpdateSettings,
} from "@/hooks/use-openwrt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SystemSettings, TimezoneEntry } from "@/lib/openwrt/types";
import { formatEpoch, formatUptime } from "@/lib/format";

/** Zone names offered only when the device exposes no zone table of its own. */
const COMMON_ZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/** `conloglevel` choices, most verbose first — the order LuCI's ListValue uses. */
const CONLOGLEVELS = [
  { value: "8", key: "debug" },
  { value: "7", key: "info" },
  { value: "6", key: "notice" },
  { value: "5", key: "warning" },
  { value: "4", key: "error" },
  { value: "3", key: "critical" },
  { value: "2", key: "alert" },
  { value: "1", key: "emergency" },
] as const;

/** `cronloglevel` has its own non-contiguous scale (5/8/9), not conloglevel's. */
const CRONLOGLEVELS = [
  { value: "5", key: "debug" },
  { value: "8", key: "normal" },
  { value: "9", key: "warning" },
] as const;

const LOG_PROTOS = ["udp", "tcp"];

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A select whose first entry is "not set". Every logging option is
 * `o.optional = true` in LuCI, so an absent option is a legitimate state that
 * the form has to be able to represent — and to restore.
 */
function OptionalSelect({
  id,
  value,
  onChange,
  choices,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  choices: { value: string; label: string }[];
}) {
  const tc = useTranslations("common");
  return (
    <Select value={value === "" ? UNSET : value} onValueChange={(v) => onChange(v === UNSET ? "" : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{tc("none")}</SelectItem>
        {choices.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Radix Select rejects an empty string value, so "absent" needs a sentinel. */
const UNSET = "\u0000unset";

function GeneralCard() {
  const t = useTranslations("system");
  const { data, isLoading, isError, error } = useSettings();
  const { data: zones } = useTimezones();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="text-muted-foreground size-4" />
          {t("general")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorState error={error} />
        ) : isLoading || !data ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <GeneralForm initial={data} zones={zones ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

type GeneralDraft = {
  hostname?: string;
  zonename?: string;
  timezone?: string;
  ntpEnabled?: boolean;
  ntpServer?: boolean;
  ntpText?: string;
};

function GeneralForm({ initial, zones }: { initial: SystemSettings; zones: TimezoneEntry[] }) {
  const t = useTranslations("system");
  const tc = useTranslations("common");
  const save = useUpdateSettings();

  // Untouched fields fall back to the stored value instead of being copied into
  // state by an effect, so a background refetch cannot clobber an edit and the
  // form needs no synchronisation pass of its own.
  const [draft, setDraft] = useState<GeneralDraft>({});
  const set = <K extends keyof GeneralDraft>(key: K, value: GeneralDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const hostname = draft.hostname ?? initial.hostname;
  const zonename = draft.zonename ?? initial.zonename;
  const tzString = draft.timezone ?? initial.timezone;
  const ntpEnabled = draft.ntpEnabled ?? initial.ntpEnabled;
  const ntpServer = draft.ntpServer ?? initial.ntpServer;
  const ntpText = draft.ntpText ?? initial.ntpServers.join("\n");

  // When the device offers a zone table the POSIX string is derived from the
  // zone name exactly as LuCI derives it, and is shown read-only: editing both
  // independently is how a config ends up naming Asia/Tokyo while the clock
  // still runs on CST-8. With no table there is nothing to derive from, so both
  // stay free text and both are submitted.
  const derivable = zones.length > 0;
  const shownTz = derivable ? (zones.find((z) => z.name === zonename)?.tz ?? "") : tzString;

  const dirty =
    hostname !== initial.hostname ||
    zonename !== initial.zonename ||
    (!derivable && tzString !== initial.timezone) ||
    ntpEnabled !== initial.ntpEnabled ||
    ntpServer !== initial.ntpServer ||
    splitLines(ntpText).join("\n") !== initial.ntpServers.join("\n");

  function onSave() {
    save.mutate(
      {
        hostname: hostname.trim(),
        zonename: zonename.trim(),
        ...(derivable ? {} : { timezone: tzString.trim() }),
        ntpEnabled,
        ntpServer,
        ntpServers: splitLines(ntpText),
      },
      {
        onSuccess: () => {
          setDraft({});
          toast.success(t("saved"));
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  const zoneNames = derivable ? zones.map((z) => z.name) : COMMON_ZONES;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hostname">{t("hostname")}</Label>
          <Input
            id="hostname"
            value={hostname}
            onChange={(e) => set("hostname", e.target.value)}
            maxLength={64}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zonename">{t("timezone")}</Label>
          <Input
            id="zonename"
            value={zonename}
            list="common-zones"
            onChange={(e) => set("zonename", e.target.value)}
            placeholder="Asia/Shanghai"
          />
          <datalist id="common-zones">
            {zoneNames.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tzstring">{t("timezonePosix")}</Label>
        {derivable ? (
          <p id="tzstring" className="text-muted-foreground font-mono text-xs">
            {shownTz || t("unknownZone")}
          </p>
        ) : (
          <Input
            id="tzstring"
            value={tzString}
            onChange={(e) => set("timezone", e.target.value)}
            placeholder="CST-8"
            className="font-mono text-xs"
          />
        )}
        {derivable ? (
          <p className="text-muted-foreground text-xs">{t("timezoneDerived")}</p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="ntp" className="cursor-pointer">
            {t("ntpEnabled")}
          </Label>
          <Switch id="ntp" checked={ntpEnabled} onCheckedChange={(v) => set("ntpEnabled", v)} />
        </div>
        {/* LuCI hangs both of these off `enable` with `o:depends("enable", "1")`. */}
        <div className="flex items-center justify-between">
          <Label htmlFor="ntp-server" className="cursor-pointer">
            {t("ntpServer")}
          </Label>
          <Switch
            id="ntp-server"
            checked={ntpServer}
            disabled={!ntpEnabled}
            onCheckedChange={(v) => set("ntpServer", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ntp-servers">{t("ntp")}</Label>
          <Textarea
            id="ntp-servers"
            value={ntpText}
            onChange={(e) => set("ntpText", e.target.value)}
            rows={4}
            disabled={!ntpEnabled}
            className="font-mono text-xs"
            placeholder="0.openwrt.pool.ntp.org"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
          <SaveIcon className="size-4" />
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </div>
  );
}

function LoggingCard() {
  const t = useTranslations("system");
  const { data, isLoading, isError, error } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="text-muted-foreground size-4" />
          {t("logging")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorState error={error} />
        ) : isLoading || !data ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <LoggingForm initial={data} />
        )}
      </CardContent>
    </Card>
  );
}

type LoggingDraft = Partial<
  Pick<
    SystemSettings,
    "logSize" | "logIp" | "logPort" | "logProto" | "logFile" | "conloglevel" | "cronloglevel"
  >
>;

function LoggingForm({ initial }: { initial: SystemSettings }) {
  const t = useTranslations("system");
  const tc = useTranslations("common");
  const save = useUpdateSettings();
  const [draft, setDraft] = useState<LoggingDraft>({});
  const set = <K extends keyof LoggingDraft>(key: K, value: LoggingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const current = {
    logSize: draft.logSize ?? initial.logSize,
    logIp: draft.logIp ?? initial.logIp,
    logPort: draft.logPort ?? initial.logPort,
    logProto: draft.logProto ?? initial.logProto,
    logFile: draft.logFile ?? initial.logFile,
    conloglevel: draft.conloglevel ?? initial.conloglevel,
    cronloglevel: draft.cronloglevel ?? initial.cronloglevel,
  };
  const dirty = (Object.keys(current) as (keyof LoggingDraft)[]).some(
    (k) => current[k] !== initial[k],
  );

  function onSave() {
    save.mutate(current, {
      onSuccess: () => {
        setDraft({});
        toast.success(t("saved"));
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="log-size">{t("logSize")}</Label>
          <Input
            id="log-size"
            value={current.logSize}
            inputMode="numeric"
            placeholder="16"
            onChange={(e) => set("logSize", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conloglevel">{t("conloglevel")}</Label>
          <OptionalSelect
            id="conloglevel"
            value={current.conloglevel}
            onChange={(v) => set("conloglevel", v)}
            choices={CONLOGLEVELS.map((c) => ({ value: c.value, label: t(`levels.${c.key}`) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="log-ip">{t("logIp")}</Label>
          <Input
            id="log-ip"
            value={current.logIp}
            placeholder="0.0.0.0"
            onChange={(e) => set("logIp", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="log-port">{t("logPort")}</Label>
          <Input
            id="log-port"
            value={current.logPort}
            inputMode="numeric"
            placeholder="514"
            onChange={(e) => set("logPort", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="log-proto">{t("logProto")}</Label>
          <OptionalSelect
            id="log-proto"
            value={current.logProto}
            onChange={(v) => set("logProto", v)}
            choices={LOG_PROTOS.map((p) => ({ value: p, label: p.toUpperCase() }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cronloglevel">{t("cronloglevel")}</Label>
          <OptionalSelect
            id="cronloglevel"
            value={current.cronloglevel}
            onChange={(v) => set("cronloglevel", v)}
            choices={CRONLOGLEVELS.map((c) => ({ value: c.value, label: t(`levels.${c.key}`) }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="log-file">{t("logFile")}</Label>
        <Input
          id="log-file"
          value={current.logFile}
          placeholder="/tmp/system.log"
          className="font-mono text-xs"
          onChange={(e) => set("logFile", e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
          <SaveIcon className="size-4" />
          {save.isPending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 last:border-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-right text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function DeviceInfoCard() {
  const t = useTranslations("system");
  const td = useTranslations("dashboard");
  const { data: board, isLoading } = useBoard();
  const { data: info } = useSystemInfo();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <InfoIcon className="text-muted-foreground size-4" />
          {t("deviceInfo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !board ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <dl>
            <InfoRow label={td("hostname")} value={board.hostname} />
            <InfoRow label={td("model")} value={board.model} />
            <InfoRow label={td("target")} value={board.release.target} />
            <InfoRow
              label={td("distribution")}
              value={`${board.release.distribution} ${board.release.version}`.trim()}
            />
            <InfoRow label={td("kernel")} value={board.kernel} />
            <InfoRow label={td("revision")} value={board.release.revision} />
            <InfoRow label={t("uptime")} value={info ? formatUptime(info.uptime) : undefined} />
            <InfoRow
              label={t("localtime")}
              value={info ? formatEpoch(info.localtime) : undefined}
            />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const t = useTranslations("system");
  const tc = useTranslations("common");
  const change = useChangePassword();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) {
      toast.error(t("passwordMismatch"));
      return;
    }
    if (!pw) {
      toast.error(tc("required"));
      return;
    }
    change.mutate(pw, {
      onSuccess: () => {
        toast.success(t("passwordChanged"));
        setPw("");
        setConfirm("");
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyIcon className="text-muted-foreground size-4" />
          {t("changePassword")}
        </CardTitle>
        <CardDescription>{t("passwordHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="newpw">{t("newPassword")}</Label>
              <Input
                id="newpw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmpw">{t("confirmPassword")}</Label>
              <Input
                id="confirmpw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={change.isPending || !pw}>
              <SaveIcon className="size-4" />
              {change.isPending ? tc("saving") : tc("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RebootCard() {
  const t = useTranslations("system");
  const tc = useTranslations("common");
  const reboot = useReboot();

  function onReboot() {
    reboot.mutate(undefined, {
      onSuccess: () => toast.success(t("rebooting")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <PowerIcon className="size-4" />
          {t("dangerZone")}
        </CardTitle>
        <CardDescription>{t("rebootWarning")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={reboot.isPending}>
              <PowerIcon className="size-4" />
              {reboot.isPending ? t("rebooting") : t("reboot")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("rebootConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>{t("rebootWarning")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onReboot}>
                {t("reboot")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function SystemPage() {
  const t = useTranslations("system");
  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GeneralCard />
        <DeviceInfoCard />
        <LoggingCard />
        <PasswordCard />
        <RebootCard />
      </div>
    </div>
  );
}
