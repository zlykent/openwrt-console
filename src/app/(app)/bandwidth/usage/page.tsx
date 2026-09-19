"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  FileTextIcon,
  RotateCcwIcon,
  SaveIcon,
  Settings2Icon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useResetUsage,
  useSaveUsagePersist,
  useSaveUsageUserFile,
  useUsage,
  useUsageUserFile,
} from "@/hooks/use-openwrt";
import {
  aggregateHostTotals,
  formatUsageSize,
  sortUsageRows,
  USAGE_REFRESH_INTERVALS,
  USAGE_SORT_COLUMNS,
  usageTotals,
  withSpeeds,
  type UsageDisplayRow,
  type UsageRow,
  type UsageSortColumn,
} from "@/lib/openwrt/wrtbwmon-view";

/**
 * luci-app-wrtbwmon (admin/nlbw/usage) with its three official leaf pages:
 * Details (live counters table), Configuration (the `persist` flag) and the
 * custom user file. Column set, ordering, speeds, per-host sub-totals and the
 * auto-refresh intervals follow `/www/luci-static/wrtbwmon/wrtbwmon.js`.
 */

const COLUMNS: { id: keyof typeof USAGE_SORT_COLUMNS | null; column: UsageSortColumn | null; label: string }[] = [
  { id: "client", column: USAGE_SORT_COLUMNS.client, label: "colClient" },
  { id: "download", column: USAGE_SORT_COLUMNS.download, label: "colDownload" },
  { id: "upload", column: USAGE_SORT_COLUMNS.upload, label: "colUpload" },
  { id: "totalDown", column: USAGE_SORT_COLUMNS.totalDown, label: "colTotalDown" },
  { id: "totalUp", column: USAGE_SORT_COLUMNS.totalUp, label: "colTotalUp" },
  { id: "total", column: USAGE_SORT_COLUMNS.total, label: "colTotal" },
  { id: null, column: null, label: "colFirstSeen" },
  { id: null, column: null, label: "colLastSeen" },
];

function formatStamp(iso: string | null, raw: string): string {
  if (!iso) return raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
}

export default function UsagePage() {
  const t = useTranslations("wrtbwmon");
  const tc = useTranslations("common");
  const [tab, setTab] = useState("details");
  // Official default of #intervalSelect is 5 seconds; -1 disables auto refresh.
  const [interval, setIntervalSec] = useState(5);
  const [perHost, setPerHost] = useState(false);
  const [sortColumn, setSortColumn] = useState<UsageSortColumn>(USAGE_SORT_COLUMNS.total);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<UsageDisplayRow[]>([]);
  const [userDraft, setUserDraft] = useState<string | null>(null);
  const prev = useRef<{ rows: UsageRow[]; at: number } | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useUsage(
    interval > 0 ? interval * 1000 : undefined,
  );
  const reset = useResetUsage();
  const savePersist = useSaveUsagePersist();
  const userFile = useUsageUserFile();
  const saveUserFile = useSaveUsageUserFile();

  // Speeds are the delta against the previous poll, like parseValueRow().
  useEffect(() => {
    if (!data) return;
    const at = Date.now();
    const last = prev.current;
    const elapsed = last ? (at - last.at) / 1000 : 0;
    setRows(withSpeeds(data.rows, last?.rows, elapsed));
    prev.current = { rows: data.rows, at };
  }, [data]);

  // One heartbeat per second drives the official "refresh in N seconds" note.
  useEffect(() => {
    if (interval <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [interval]);

  const fetchedAt = data ? new Date(data.updatedAt).getTime() : Number.NaN;
  const countdown =
    interval > 0 && Number.isFinite(fetchedAt)
      ? Math.min(interval, Math.max(0, interval - Math.floor((now - fetchedAt) / 1000)))
      : 0;
  const userContent = userDraft ?? userFile.data?.content ?? "";

  const visible = useMemo(() => {
    const grouped = perHost ? aggregateHostTotals(rows) : rows;
    return sortUsageRows(grouped, sortColumn, sortDir);
  }, [rows, perHost, sortColumn, sortDir]);
  const totals = useMemo(() => usageTotals(rows), [rows]);

  function onSort(column: UsageSortColumn | null) {
    if (column === null) return;
    if (column === sortColumn) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortColumn(column);
      setSortDir("desc");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCcwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={reset.isPending}>
              <RotateCcwIcon className="size-4" />
              {t("resetDatabase")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("resetDatabase")}</AlertDialogTitle>
              <AlertDialogDescription>{t("resetConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  reset.mutate(undefined, {
                    onSuccess: () => toast.success(t("resetDone")),
                    onError: (e) => toast.error((e as Error).message),
                  })
                }
              >
                {t("resetDatabase")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="details">
            <BarChart3Icon className="size-4" data-icon="inline-start" />
            {t("tabDetails")}
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings2Icon className="size-4" data-icon="inline-start" />
            {t("tabConfig")}
          </TabsTrigger>
          <TabsTrigger value="custom">
            <FileTextIcon className="size-4" data-icon="inline-start" />
            {t("tabCustom")}
          </TabsTrigger>
        </TabsList>

        {/* ---- Details (admin/nlbw/usage/details) ---- */}
        <TabsContent value="details" className="flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  {t("tabDetails")}
                  {data ? (
                    <Badge variant="secondary" className="tabular-nums">
                      {data.rows.length}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs font-normal">
                  <span>
                    {data ? t("updatedAt", { time: new Date(data.updatedAt).toLocaleString() }) : ""}
                    {interval > 0 && !isFetching ? ` ${t("updatingIn", { seconds: countdown })}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <Label htmlFor="usage-interval" className="text-xs font-normal">
                      {t("autoRefreshInterval")}
                    </Label>
                    <Select
                      value={String(interval)}
                      onValueChange={(v) => setIntervalSec(Number(v))}
                    >
                      <SelectTrigger id="usage-interval" size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USAGE_REFRESH_INTERVALS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.value === -1
                              ? t("disabled")
                              : opt.minutes
                                ? `${opt.minutes} ${t("minutes")}`
                                : `${opt.seconds} ${t("seconds")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                  <span className="flex items-center gap-2">
                    <Checkbox
                      id="usage-per-host"
                      checked={perHost}
                      onCheckedChange={(v) => setPerHost(v === true)}
                    />
                    <Label htmlFor="usage-per-host" className="text-xs font-normal">
                      {t("perHostTotals")}
                    </Label>
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {isError ? (
                <ErrorState error={error} onRetry={() => refetch()} />
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="contents">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {COLUMNS.map((col) => (
                          <TableHead
                            key={col.label}
                            className={
                              col.column === null
                                ? "whitespace-nowrap"
                                : "cursor-pointer whitespace-nowrap select-none"
                            }
                            onClick={() => onSort(col.column)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {t(col.label)}
                              {col.column !== null && col.column === sortColumn ? (
                                sortDir === "desc" ? (
                                  <ArrowDownIcon className="size-3" />
                                ) : (
                                  <ArrowUpIcon className="size-3" />
                                )
                              ) : null}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={COLUMNS.length} className="text-muted-foreground py-10 text-center">
                            {t("loading")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        visible.map((entry, i) => (
                          <TableRow key={`${entry.row.mac}-${entry.row.ip}-${i}`}>
                            <TableCell title={entry.row.mac}>
                              {entry.hostTotal ? (
                                <span className="font-medium">
                                  {entry.row.user} {t("hostTotal")}
                                </span>
                              ) : (
                                <>
                                  {entry.row.user}
                                  <br />
                                  <span className="text-muted-foreground text-xs">{entry.row.ip}</span>
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatUsageSize(entry.dlSpeed)}/s
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatUsageSize(entry.upSpeed)}/s
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatUsageSize(entry.row.in)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatUsageSize(entry.row.out)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatUsageSize(entry.row.total)}
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                              {entry.hostTotal ? "" : formatStamp(entry.row.firstSeenIso, entry.row.firstSeen)}
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                              {entry.hostTotal ? "" : formatStamp(entry.row.lastSeenIso, entry.row.lastSeen)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="bg-muted/40 font-medium">
                        <TableCell>{t("totalRow")}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatUsageSize(totals[0])}/s
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatUsageSize(totals[1])}/s
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatUsageSize(totals[2])}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatUsageSize(totals[3])}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatUsageSize(totals[4])}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Configuration (admin/nlbw/usage/config) ---- */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>{t("generalSettings")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="usage-persist">{t("persist")}</Label>
                  <CardDescription>{t("persistHint")}</CardDescription>
                </div>
                <Switch
                  id="usage-persist"
                  checked={data?.persist ?? false}
                  disabled={!data || savePersist.isPending}
                  onCheckedChange={(checked) =>
                    savePersist.mutate(checked, {
                      onSuccess: () => {
                        toast.success(t("saved"));
                        refetch();
                      },
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t("dbPath")}: <span className="font-mono">{data?.dbPath ?? "—"}</span>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- User file (admin/nlbw/usage/custom) ---- */}
        <TabsContent value="custom">
          <Card>
            <CardHeader>
              <CardTitle>{t("customTitle")}</CardTitle>
              <CardDescription>{t("customHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {userFile.isError ? (
                <ErrorState
                  error={userFile.error}
                  onRetry={() => userFile.refetch()}
                />
              ) : (
                <>
                  <Textarea
                    id="usage-user-file"
                    value={userContent}
                    onChange={(e) => setUserDraft(e.target.value)}
                    spellCheck={false}
                    rows={20}
                    className="font-mono text-xs"
                    placeholder={"00:aa:bb:cc:ee:ff,username"}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={saveUserFile.isPending || userContent === (userFile.data?.content ?? "")}
                      onClick={() =>
                        saveUserFile.mutate(userContent, {
                          onSuccess: () => {
                            setUserDraft(null);
                            toast.success(t("saved"));
                          },
                          onError: (e) => toast.error((e as Error).message),
                        })
                      }
                    >
                      <SaveIcon className="size-4" />
                      {saveUserFile.isPending ? tc("saving") : tc("save")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
