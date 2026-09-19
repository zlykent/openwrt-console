"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { CpuChart, LoadChart, MemoryChart, TrafficChart } from "@/components/charts";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { formatBytes, formatLoad, formatPercent, formatRate } from "@/lib/format";

const TOTAL = "__total__";

function ChartSkeleton() {
  return <Skeleton className="h-full min-h-40 w-full rounded-lg" />;
}

export default function RealtimeGraphsPage() {
  const t = useTranslations("realtimeGraphs");
  const tc = useTranslations("common");
  const metrics = useLiveMetrics(3000, 120);
  const { series, perIfaceSeries, interfaces, cpu, rate, isFetching, isError, error } = metrics;

  const [tab, setTab] = useState("cpu");
  const [iface, setIface] = useState<string>(TOTAL);

  const hasData = series.length > 1;
  const latest = hasData ? series[series.length - 1] : null;

  const trafficData = iface === TOTAL ? series : (perIfaceSeries[iface] ?? []);
  const trafficRate = (() => {
    if (iface === TOTAL) return rate;
    const arr = perIfaceSeries[iface];
    const last = arr && arr.length > 0 ? arr[arr.length - 1] : null;
    return last ? { rx: last.rx, tx: last.tx } : { rx: 0, tx: 0 };
  })();
  const memPct =
    latest && latest.memTotal > 0 ? (latest.memUsed / latest.memTotal) * 100 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Badge variant="outline" className="gap-1.5">
          <span className="bg-emerald-500 inline-block size-2 animate-pulse rounded-full" />
          {tc("live")}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => metrics.refetch()}
          disabled={isFetching}
        >
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => metrics.refetch()} />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="cpu">{t("cpu")}</TabsTrigger>
          <TabsTrigger value="load">{t("load")}</TabsTrigger>
          <TabsTrigger value="memory">{t("memory")}</TabsTrigger>
          <TabsTrigger value="traffic">{t("traffic")}</TabsTrigger>
        </TabsList>

        <TabsContent value="cpu" className="mt-4 flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>{t("cpu")}</CardTitle>
              <CardDescription>{t("cpuHint")}</CardDescription>
              <CardAction>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatPercent(cpu, 1)}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {hasData ? <CpuChart data={series} height="100%" /> : <ChartSkeleton />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="load" className="mt-4 flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>{t("load")}</CardTitle>
              <CardDescription>{t("loadHint")}</CardDescription>
              <CardAction>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {latest ? formatLoad([latest.l1, latest.l5, latest.l15]) : "—"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {hasData ? (
                <LoadChart
                  data={series}
                  height="100%"
                  names={{ l1: t("load1"), l5: t("load5"), l15: t("load15") }}
                />
              ) : (
                <ChartSkeleton />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="mt-4 flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>{t("memory")}</CardTitle>
              <CardDescription>{t("memoryHint")}</CardDescription>
              <CardAction>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {latest
                    ? `${formatBytes(latest.memUsed)} / ${formatBytes(latest.memTotal)} (${formatPercent(memPct, 0)})`
                    : "—"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {hasData ? (
                <MemoryChart data={series} height="100%" name={t("used")} />
              ) : (
                <ChartSkeleton />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traffic" className="mt-4 flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>{t("traffic")}</CardTitle>
              <CardDescription>{t("trafficHint")}</CardDescription>
              <CardAction>
                <div className="flex items-center gap-3">
                  <Select value={iface} onValueChange={setIface}>
                    <SelectTrigger size="sm" className="w-[160px]">
                      <SelectValue placeholder={t("interface")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TOTAL}>{t("aggregate")}</SelectItem>
                      {interfaces.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="flex items-center gap-1">
                      <ArrowDownIcon className="size-3 text-[var(--chart-2)]" />
                      {formatRate(trafficRate.rx)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowUpIcon className="size-3 text-[var(--chart-4)]" />
                      {formatRate(trafficRate.tx)}
                    </span>
                  </div>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {trafficData.length > 1 ? (
                <TrafficChart data={trafficData} height="100%" />
              ) : (
                <ChartSkeleton />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!hasData && !isError ? (
        <p className="text-muted-foreground mt-4 text-center text-sm">{t("collecting")}</p>
      ) : null}
    </div>
  );
}
