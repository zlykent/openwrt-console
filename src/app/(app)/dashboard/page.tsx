"use client";

import { useTranslations } from "next-intl";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  CpuIcon,
  MemoryStickIcon,
  NetworkIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CpuChart, TrafficChart } from "@/components/charts";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard, useInterfaces, useNeighbors } from "@/hooks/use-openwrt";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { formatBytes, formatLoad, formatPercent, formatUptime } from "@/lib/format";

function ChartSkeleton() {
  return <Skeleton className="h-[180px] w-full rounded-lg" />;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed pb-2 last:border-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-right text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tn = useTranslations("network");
  const { data: board, isLoading: boardLoading, isError: boardError } = useBoard();
  const { data: interfaces } = useInterfaces();
  const { data: neighbors } = useNeighbors();
  const metrics = useLiveMetrics(3000);
  const stats = metrics.data;

  const mem = stats?.memory;
  const memPct = mem && mem.total > 0 ? (mem.used / mem.total) * 100 : 0;
  const swap = stats?.swap;
  const swapPct = swap && swap.total > 0 ? ((swap.total - swap.free) / swap.total) * 100 : 0;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Badge variant="outline" className="gap-1.5">
          <span className="bg-emerald-500 inline-block size-2 animate-pulse rounded-full" />
          {tc("live")}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => metrics.refetch()}
          disabled={metrics.isFetching}
        >
          <RefreshCwIcon className={metrics.isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      {metrics.isError ? (
        <ErrorState
          error={metrics.error}
          onRetry={() => metrics.refetch()}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("cpuUsage")}
          value={formatPercent(metrics.cpu, 0)}
          sub={board?.system || undefined}
          icon={<CpuIcon className="size-4" />}
        />
        <StatCard
          label={t("memoryUsage")}
          value={formatPercent(memPct, 0)}
          sub={mem ? `${formatBytes(mem.used)} / ${formatBytes(mem.total)}` : undefined}
          icon={<MemoryStickIcon className="size-4" />}
        />
        <StatCard
          label={t("uptime")}
          value={stats ? formatUptime(stats.uptime) : "—"}
          icon={<ClockIcon className="size-4" />}
        />
        <StatCard
          label={t("loadAverage")}
          value={stats ? formatLoad(stats.load) : "—"}
          icon={<ActivityIcon className="size-4" />}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("cpuUsage")}</CardTitle>
            <CardAction>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatPercent(metrics.cpu, 1)}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            {metrics.series.length > 1 ? <CpuChart data={metrics.series} /> : <ChartSkeleton />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("throughput")}</CardTitle>
            <CardAction>
              <div className="flex items-center gap-3 text-xs tabular-nums">
                <span className="flex items-center gap-1">
                  <ArrowDownIcon className="size-3 text-[var(--chart-2)]" />
                  {formatBytes(metrics.rate.rx)}/s
                </span>
                <span className="flex items-center gap-1">
                  <ArrowUpIcon className="size-3 text-[var(--chart-4)]" />
                  {formatBytes(metrics.rate.tx)}/s
                </span>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {metrics.series.length > 1 ? <TrafficChart data={metrics.series} /> : <ChartSkeleton />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("memory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mem ? (
              <>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("memory")}</span>
                    <span className="tabular-nums">
                      {formatBytes(mem.used)} / {formatBytes(mem.total)}
                    </span>
                  </div>
                  <Progress value={memPct} />
                </div>
                {swap && swap.total > 0 ? (
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">{t("swap")}</span>
                      <span className="tabular-nums">
                        {formatBytes(swap.total - swap.free)} / {formatBytes(swap.total)}
                      </span>
                    </div>
                    <Progress value={swapPct} />
                  </div>
                ) : null}
                <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt>{t("available")}</dt>
                    <dd className="text-foreground tabular-nums">{formatBytes(mem.available)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>cached</dt>
                    <dd className="text-foreground tabular-nums">{formatBytes(mem.cached)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>buffered</dt>
                    <dd className="text-foreground tabular-nums">{formatBytes(mem.buffered)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("free")}</dt>
                    <dd className="text-foreground tabular-nums">{formatBytes(mem.free)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <Skeleton className="h-32 w-full rounded-lg" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("deviceInfo")}</CardTitle>
          </CardHeader>
          <CardContent>
            {boardLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : boardError ? (
              <ErrorState />
            ) : board ? (
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <InfoRow label={t("hostname")} value={board.hostname} />
                <InfoRow label={t("model")} value={board.model} />
                <InfoRow
                  label={t("distribution")}
                  value={`${board.release.distribution} ${board.release.version}`.trim()}
                />
                <InfoRow label={t("target")} value={board.release.target} />
                <InfoRow label={t("kernel")} value={board.kernel} />
                <InfoRow label={t("revision")} value={board.release.revision} />
              </dl>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NetworkIcon className="text-muted-foreground size-4" />
              {t("interfaces")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {interfaces && interfaces.length > 0 ? (
              <ul className="divide-y">
                {interfaces.map((iface) => {
                  const ip = iface.ipv4[0]?.address ?? iface.ipv6[0]?.address;
                  return (
                    <li key={iface.name} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            iface.up
                              ? "bg-emerald-500 inline-block size-2 shrink-0 rounded-full"
                              : "bg-muted-foreground/40 inline-block size-2 shrink-0 rounded-full"
                          }
                        />
                        <span className="truncate font-medium">{iface.name}</span>
                        <span className="text-muted-foreground truncate text-xs">{iface.proto}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                        {ip ? <span className="text-muted-foreground hidden sm:inline">{ip}</span> : null}
                        {iface.statistics ? (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <span className="flex items-center gap-0.5">
                              <ArrowDownIcon className="size-3" />
                              {formatBytes(iface.statistics.rxBytes)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <ArrowUpIcon className="size-3" />
                              {formatBytes(iface.statistics.txBytes)}
                            </span>
                          </span>
                        ) : null}
                        <Badge variant={iface.up ? "default" : "secondary"}>
                          {iface.up ? tn("up") : tn("down")}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">{tc("noData")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="text-muted-foreground size-4" />
              {t("clients")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums">{neighbors?.length ?? 0}</div>
            <p className="text-muted-foreground mt-1 text-xs">{t("networkOverview")}</p>
            {neighbors && neighbors.length > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {neighbors.slice(0, 6).map((n) => (
                  <li key={`${n.ip}-${n.mac}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{n.ip}</span>
                    <span className="text-muted-foreground truncate font-mono">{n.mac}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
