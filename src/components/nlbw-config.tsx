"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangleIcon, PlusIcon, RotateCcwIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { NlbwConfigInput, NlbwConfigState } from "@/lib/openwrt/nlbwmon";

/** Official `commit_interval` combobox choices. */
const COMMIT_CHOICES = ["24h", "12h", "10m", "60s"];
/** Official `refresh_interval` combobox choices. */
const REFRESH_CHOICES = ["30s", "5m"];
/** Official `_interval` combobox choices. */
const DUE_DATE_CHOICES = ["1", "-1", "-7"];

function draftOf(state: NlbwConfigState): NlbwConfigInput {
  return {
    period: state.period,
    interval: state.interval || "1",
    date: state.date,
    days: state.days,
    ifaces: [...state.ifaces],
    subnets: [...state.subnets],
    databaseLimit: state.databaseLimit,
    databasePrealloc: state.databasePrealloc,
    databaseCompress: state.databaseCompress,
    databaseGenerations: state.databaseGenerations,
    commitInterval: state.commitInterval,
    refreshInterval: state.refreshInterval,
    databaseDirectory: state.databaseDirectory,
    protocols: state.protocols,
  };
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-4">
      <Label htmlFor={htmlFor} className="sm:pt-2 sm:font-normal">
        {label}
      </Label>
      <div className="min-w-0 space-y-1.5">
        {children}
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}

function FlagField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-4">
      <span className="sm:pt-1.5 text-sm">{label}</span>
      <div className="space-y-1.5">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Editable string list — the CBI `DynamicList` equivalent. */
function StringList({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {value.map((entry, i) => (
        // Index keys are fine: the list is edited in place and never reordered.
        <div key={i} className="flex items-center gap-1.5">
          <Input
            className="font-mono text-xs"
            value={entry}
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
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ""])}>
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * The nlbwmon configuration form (official `admin/nlbw/config`).
 *
 * The draft is seeded once from `state`; the page remounts this component via
 * a content key whenever the stored config actually changes, so the form never
 * overwrites an in-progress edit.
 */
export function NlbwConfigForm({
  state,
  saving,
  onSave,
  onShowBackup,
}: {
  state: NlbwConfigState;
  saving: boolean;
  onSave: (input: NlbwConfigInput) => Promise<unknown> | void;
  /** The official warning links to the backup page. */
  onShowBackup: () => void;
}) {
  const t = useTranslations("bandwidth");
  const [draft, setDraft] = useState<NlbwConfigInput>(() => draftOf(state));
  const [tab, setTab] = useState("general");

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftOf(state)), [draft, state]);

  const set = <K extends keyof NlbwConfigInput>(key: K, value: NlbwConfigInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Official: the warning only appears when switching *away* from the stored type.
  const showWarning =
    state.period === "absolute" ? draft.period === "relative" : draft.period === "absolute";
  const showPrealloc = draft.databaseLimit.trim() !== "0";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onSave(draft);
      toast.success(t("configSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="general">{t("tabGeneral")}</TabsTrigger>
          <TabsTrigger value="advanced">{t("tabAdvanced")}</TabsTrigger>
          <TabsTrigger value="protocol">{t("tabProtocol")}</TabsTrigger>
        </TabsList>

        {/* ---- General Settings ---- */}
        <TabsContent value="general" className="divide-y">
          <Field label={t("fPeriod")} hint={t("fPeriodHint")} htmlFor="nlbw-period">
            <Select value={draft.period} onValueChange={(v) => set("period", v as NlbwConfigInput["period"])}>
              <SelectTrigger id="nlbw-period" className="sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relative">{t("periodRelative")}</SelectItem>
                <SelectItem value="absolute">{t("periodAbsolute")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {showWarning ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span>
                {t("periodWarning")}{" "}
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onShowBackup}>
                  {t("periodWarningLink")}
                </Button>
                .
              </span>
            </div>
          ) : null}

          {draft.period === "relative" ? (
            <Field label={t("fDueDate")} hint={t("fDueDateHint")} htmlFor="nlbw-interval">
              <Input
                id="nlbw-interval"
                list="nlbw-interval-choices"
                className="sm:max-w-xs"
                value={draft.interval}
                placeholder="1"
                onChange={(e) => set("interval", e.target.value)}
              />
              <datalist id="nlbw-interval-choices">
                {DUE_DATE_CHOICES.map((v) => (
                  <option key={v} value={v}>
                    {t(`dueDate${v.replace("-", "Minus")}`)}
                  </option>
                ))}
              </datalist>
            </Field>
          ) : (
            <>
              <Field label={t("fStartDate")} hint={t("fStartDateHint")} htmlFor="nlbw-date">
                <Input
                  id="nlbw-date"
                  className="font-mono sm:max-w-xs"
                  value={draft.date}
                  placeholder="2016-03-15"
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label={t("fDays")} hint={t("fDaysHint")} htmlFor="nlbw-days">
                <Input
                  id="nlbw-days"
                  className="sm:max-w-xs"
                  value={draft.days}
                  placeholder="30"
                  inputMode="numeric"
                  onChange={(e) => set("days", e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label={t("fIfaces")} hint={t("fIfacesHint")}>
            <div className="flex flex-wrap gap-3">
              {state.availableIfaces.map((name) => {
                const checked = draft.ifaces.includes(name);
                return (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        set("ifaces", v ? [...draft.ifaces, name] : draft.ifaces.filter((x) => x !== name))
                      }
                    />
                    <span className="font-mono text-xs">{name}</span>
                  </label>
                );
              })}
              {state.availableIfaces.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t("noInterfaces")}</span>
              ) : null}
            </div>
          </Field>

          <Field label={t("fSubnets")} hint={t("fSubnetsHint")}>
            <StringList
              value={draft.subnets}
              onChange={(v) => set("subnets", v)}
              placeholder="192.168.1.0/24"
            />
          </Field>
        </TabsContent>

        {/* ---- Advanced Settings ---- */}
        <TabsContent value="advanced" className="divide-y">
          <Field label={t("fLimit")} hint={t("fLimitHint")} htmlFor="nlbw-limit">
            <Input
              id="nlbw-limit"
              className="sm:max-w-xs"
              value={draft.databaseLimit}
              placeholder="10000"
              inputMode="numeric"
              onChange={(e) => set("databaseLimit", e.target.value)}
            />
          </Field>

          <FlagField
            label={t("fPrealloc")}
            hint={t("fPreallocHint")}
            checked={draft.databasePrealloc}
            disabled={!showPrealloc}
            onChange={(v) => set("databasePrealloc", v)}
          />

          <FlagField
            label={t("fCompress")}
            hint={t("fCompressHint")}
            checked={draft.databaseCompress}
            onChange={(v) => set("databaseCompress", v)}
          />

          <Field label={t("fGenerations")} hint={t("fGenerationsHint")} htmlFor="nlbw-generations">
            <Input
              id="nlbw-generations"
              className="sm:max-w-xs"
              value={draft.databaseGenerations}
              placeholder="10"
              inputMode="numeric"
              onChange={(e) => set("databaseGenerations", e.target.value)}
            />
          </Field>

          <Field label={t("fCommit")} hint={t("fCommitHint")} htmlFor="nlbw-commit">
            <Input
              id="nlbw-commit"
              list="nlbw-commit-choices"
              className="sm:max-w-xs"
              value={draft.commitInterval}
              placeholder="24h"
              onChange={(e) => set("commitInterval", e.target.value)}
            />
            <datalist id="nlbw-commit-choices">
              {COMMIT_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {t(`commit${v}`)}
                </option>
              ))}
            </datalist>
          </Field>

          <Field label={t("fRefresh")} hint={t("fRefreshHint")} htmlFor="nlbw-refresh">
            <Input
              id="nlbw-refresh"
              list="nlbw-refresh-choices"
              className="sm:max-w-xs"
              value={draft.refreshInterval}
              placeholder="30s"
              onChange={(e) => set("refreshInterval", e.target.value)}
            />
            <datalist id="nlbw-refresh-choices">
              {REFRESH_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {t(`refresh${v}`)}
                </option>
              ))}
            </datalist>
          </Field>

          <Field label={t("fDirectory")} hint={t("fDirectoryHint")} htmlFor="nlbw-dir">
            <Input
              id="nlbw-dir"
              className="font-mono text-xs"
              value={draft.databaseDirectory}
              placeholder="/var/lib/nlbwmon"
              onChange={(e) => set("databaseDirectory", e.target.value)}
            />
          </Field>
        </TabsContent>

        {/* ---- Protocol Mapping ---- */}
        <TabsContent value="protocol" className="space-y-2">
          <p className="text-muted-foreground text-xs">{t("protocolHint")}</p>
          <Textarea
            className="h-[32rem] font-mono text-xs"
            value={draft.protocols}
            onChange={(e) => set("protocols", e.target.value)}
            spellCheck={false}
          />
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={saving || !dirty}>
          <SaveIcon className={saving ? "size-4 animate-pulse" : "size-4"} />
          {t("saveApply")}
        </Button>
        <Button type="button" variant="outline" disabled={!dirty} onClick={() => setDraft(draftOf(state))}>
          <RotateCcwIcon className="size-4" />
          {t("reset")}
        </Button>
      </div>
    </form>
  );
}
