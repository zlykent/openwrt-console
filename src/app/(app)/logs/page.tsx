"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLogs } from "@/hooks/use-openwrt";
import { formatTime } from "@/lib/format";
import type { LogEntry } from "@/lib/openwrt/types";

type LogType = "syslog" | "kernel";
const LINE_OPTIONS = [100, 200, 500, 1000, 2000];

function priorityVariant(p?: string): "destructive" | "outline" | "secondary" | "ghost" {
  switch ((p || "").toLowerCase()) {
    case "emerg":
    case "alert":
    case "crit":
    case "err":
      return "destructive";
    case "warning":
      return "outline";
    case "notice":
    case "info":
      return "secondary";
    default:
      return "ghost";
  }
}

function renderTime(entry: LogEntry, type: LogType): string {
  if (type === "kernel") return entry.time > 0 ? `+${entry.time.toFixed(3)}s` : "—";
  return entry.timeText || formatTime(entry.time);
}

export default function LogsPage() {
  const t = useTranslations("logs");
  const tc = useTranslations("common");
  const [type, setType] = useState<LogType>("syslog");
  const [lines, setLines] = useState(200);
  const [filter, setFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useLogs(
    type,
    lines,
    autoRefresh ? 5000 : undefined,
  );

  const entries = useMemo(() => {
    const list = data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.msg.toLowerCase().includes(q) ||
        (e.source ?? "").toLowerCase().includes(q) ||
        (e.priority ?? "").toLowerCase().includes(q),
    );
  }, [data, filter]);

  function onDownload() {
    const text = entries
      .map(
        (e) =>
          `${renderTime(e, type)}\t${e.priority ?? ""}\t${e.source ?? ""}\t${e.msg}`.replace(
            /\t+/g,
            " ",
          ),
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openwrt-${type}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload} disabled={entries.length === 0}>
          <DownloadIcon className="size-4" />
          {t("download")}
        </Button>
      </PageHeader>

      <Card className="min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={type} onValueChange={(v) => setType(v as LogType)}>
              <TabsList>
                <TabsTrigger value="syslog">{t("system")}</TabsTrigger>
                <TabsTrigger value="kernel">{t("kernel")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative min-w-40 flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("filterPlaceholder")}
                className="pl-8"
              />
            </div>

            <Select value={String(lines)} onValueChange={(v) => setLines(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {t("lines")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              {t("autoRefresh")}
            </label>
          </div>

          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full rounded" />
              ))}
            </div>
          ) : entries.length > 0 ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-lg border">
              <table className="w-full border-collapse font-mono text-xs">
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={i}
                      className="border-b border-dashed last:border-0 hover:bg-muted/40"
                    >
                      <td className="text-muted-foreground w-40 px-2 py-1 align-top whitespace-nowrap tabular-nums">
                        {renderTime(e, type)}
                      </td>
                      <td className="w-20 px-1 py-1 align-top">
                        {e.priority ? (
                          <Badge variant={priorityVariant(e.priority)} className="text-[0.6rem]">
                            {e.priority}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground w-32 truncate px-1 py-1 align-top">
                        {e.source || ""}
                      </td>
                      <td className="px-2 py-1 align-top break-words whitespace-pre-wrap">
                        {e.msg}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noLogs")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
