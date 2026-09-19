"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ActivityIcon,
  DatabaseBackupIcon,
  DownloadIcon,
  RefreshCwIcon,
  Settings2Icon,
  UploadIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { NlbwConfigForm } from "@/components/nlbw-config";
import { NlbwDisplay } from "@/components/nlbw-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useLeases,
  useNlbwCommit,
  useNlbwConfig,
  useNlbwData,
  useRestoreNlbwBackup,
  useSaveNlbwConfig,
} from "@/hooks/use-openwrt";

/** Sentinel for the "current period" option, whose official value is "". */
const CURRENT = "__current__";

const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Port of the official `renderPeriods()`: periods are listed oldest first,
 * each labelled `<start> - <end>`, and the newest one is offered with an
 * empty value so the live database is queried without a `-t` filter.
 */
export function periodOptions(periods: string[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let i = periods.length - 1; i >= 0; i--) {
    const d1 = new Date(periods[i]);
    if (Number.isNaN(d1.getTime())) continue;
    let d2: Date;
    let value: string;
    if (i > 0) {
      d2 = new Date(periods[i - 1]);
      d2.setUTCDate(d2.getUTCDate() - 1);
      value = ymd(d1);
    } else {
      d2 = new Date();
      value = "";
    }
    options.push({ value, label: `${ymd(d1)} - ${ymd(d2)}` });
  }
  return options;
}

export default function BandwidthPage() {
  const t = useTranslations("bandwidth");
  const configQ = useNlbwConfig();
  const leasesQ = useLeases();
  const commit = useNlbwCommit();
  const save = useSaveNlbwConfig();
  const restore = useRestoreNlbwBackup();

  const [tab, setTab] = useState("display");
  const [selected, setSelected] = useState(CURRENT);
  const fileRef = useRef<HTMLInputElement>(null);

  const installed = configQ.data?.installed ?? false;
  const options = useMemo(() => periodOptions(configQ.data?.periods ?? []), [configQ.data?.periods]);
  const period = selected === CURRENT ? "" : selected;
  // Content key: remounts the form only when the stored config really changed,
  // so a background refetch never discards an in-progress edit.
  const configKey = useMemo(() => JSON.stringify(configQ.data ?? null), [configQ.data]);

  const dataQ = useNlbwData(period, installed);

  /** MAC / IP → hostname, the local stand-in for the official rrdns lookup. */
  const hostnames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lease of leasesQ.data ?? []) {
      if (!lease.hostname) continue;
      if (lease.mac) map[lease.mac.toLowerCase()] = lease.hostname;
      if (lease.ip) map[lease.ip] = lease.hostname;
    }
    return map;
  }, [leasesQ.data]);

  function onForceReload() {
    commit.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("committed"));
        void dataQ.refetch();
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function onRestore() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error(t("restoreMissing"));
      return;
    }
    restore.mutate(file, {
      onSuccess: (res) => {
        toast.success(t("restoreOk", { files: res.files.join(", ") }));
        if (fileRef.current) fileRef.current.value = "";
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void configQ.refetch();
            void dataQ.refetch();
          }}
          disabled={configQ.isFetching || dataQ.isFetching}
        >
          <RefreshCwIcon
            className={configQ.isFetching || dataQ.isFetching ? "size-4 animate-spin" : "size-4"}
          />
          {t("refresh")}
        </Button>
      </PageHeader>

      {configQ.isError ? (
        <ErrorState error={configQ.error} onRetry={() => configQ.refetch()} />
      ) : !configQ.data ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : !installed ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium">{t("notInstalled")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("notInstalledHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="display">
              <ActivityIcon className="size-4" data-icon="inline-start" />
              {t("tabDisplay")}
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings2Icon className="size-4" data-icon="inline-start" />
              {t("tabConfig")}
            </TabsTrigger>
            <TabsTrigger value="backup">
              <DatabaseBackupIcon className="size-4" data-icon="inline-start" />
              {t("tabBackup")}
            </TabsTrigger>
          </TabsList>

          {/* ---- Display (admin/nlbw/display) ---- */}
          <TabsContent value="display" className="flex min-h-0 flex-col">
            <Card className="min-h-0 flex-1">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                  <span>{t("displayTitle")}</span>
                  <span className="flex items-center gap-2">
                    <Label htmlFor="nlbw-period-select" className="text-muted-foreground text-xs font-normal">
                      {t("selectPeriod")}
                    </Label>
                    <Select value={selected} onValueChange={setSelected}>
                      <SelectTrigger id="nlbw-period-select" className="h-8 w-64 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o, i) => (
                          <SelectItem key={`${o.value}-${i}`} value={o.value === "" ? CURRENT : o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                        {options.length === 0 ? (
                          <SelectItem value={CURRENT}>{t("noPeriods")}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                {dataQ.isError ? (
                  <ErrorState
                    error={dataQ.error}
                    onRetry={() => dataQ.refetch()}
                  />
                ) : (
                  <NlbwDisplay
                    rows={dataQ.data?.rows ?? []}
                    hostnames={hostnames}
                    loading={dataQ.isLoading}
                    onForceReload={onForceReload}
                    reloading={commit.isPending}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- Configuration (admin/nlbw/config) ---- */}
          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>{t("configTitle")}</CardTitle>
                <p className="text-muted-foreground text-sm">{t("configSubtitle")}</p>
              </CardHeader>
              <CardContent>
                <NlbwConfigForm
                  key={configKey}
                  state={configQ.data}
                  saving={save.isPending}
                  onSave={(input) => save.mutateAsync(input)}
                  onShowBackup={() => setTab("backup")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- Backup / Restore (admin/nlbw/backup) ---- */}
          <TabsContent value="backup">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DatabaseBackupIcon className="text-muted-foreground size-4" />
                  {t("backupTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t("restoreTitle")}</h3>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="nlbw-archive" className="text-muted-foreground text-xs">
                        {t("restoreFile")}
                      </Label>
                      <Input
                        id="nlbw-archive"
                        ref={fileRef}
                        type="file"
                        accept="application/gzip,.gz"
                        className="h-9 max-w-sm text-xs file:mr-2"
                      />
                    </div>
                    <Button type="button" onClick={onRestore} disabled={restore.isPending}>
                      <UploadIcon className={restore.isPending ? "size-4 animate-pulse" : "size-4"} />
                      {t("restore")}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">{t("restoreHint")}</p>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t("downloadTitle")}</h3>
                  <Button variant="outline" asChild>
                    <a href="/api/bandwidth/backup" download>
                      <DownloadIcon className="size-4" />
                      {t("generateBackup")}
                    </a>
                  </Button>
                  <p className="text-muted-foreground text-xs">{t("downloadHint")}</p>
                </section>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
