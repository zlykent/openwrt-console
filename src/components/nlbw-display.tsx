"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { DonutChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NlbwRecord } from "@/lib/openwrt/nlbwmon";
import {
  connectionsPie,
  hostKey,
  hostRows,
  hostTotals,
  ipv6HostsPie,
  ipv6Rows,
  ipv6SharePie,
  ipv6Totals,
  layer7Rows,
  layer7RxPie,
  layer7Totals,
  layer7TxPie,
  nlbwBytes,
  nlbwCount,
  nlbwPackets,
  OTHER_MAC,
  trafficPie,
} from "@/lib/openwrt/nlbw-view";

/** The four official export links of the "Export" tab. */
const EXPORTS = [
  { key: "csvMac", label: "csvMac", query: "type=csv&group_by=mac&order_by=-rx_bytes,-tx_bytes" },
  { key: "csvIp", label: "csvIp", query: "type=csv&group_by=ip&order_by=-rx_bytes,-tx_bytes" },
  {
    key: "csvProtocol",
    label: "csvProtocol",
    query: "type=csv&group_by=layer7&order_by=-rx_bytes,-tx_bytes",
  },
  { key: "jsonDump", label: "jsonDump", query: "type=json" },
] as const;

/** One statistic line; the official markup puts the value first (`<big>0</big> hosts`). */
function Kpi({ value, children }: { value: string | number; children: React.ReactNode }) {
  return (
    <li className="text-muted-foreground text-sm">
      <span className="text-foreground mr-1.5 text-xl font-semibold tabular-nums">{value}</span>
      {children}
    </li>
  );
}

function PiePanel({
  label,
  data,
  format,
}: {
  label: string;
  data: { name: string; value: number; color: string }[];
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <DonutChart data={data} format={format} />
    </div>
  );
}

function EmptyRow({
  colspan,
  onForceReload,
  busy,
}: {
  colspan: number;
  onForceReload: () => void;
  busy: boolean;
}) {
  const t = useTranslations("bandwidth");
  return (
    <TableRow>
      <TableCell colSpan={colspan}>
        <em className="text-muted-foreground text-sm">{t("noData")}</em>{" "}
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onForceReload} disabled={busy}>
          {t("forceReload")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function NlbwDisplay({
  rows,
  hostnames,
  loading,
  onForceReload,
  reloading,
}: {
  rows: NlbwRecord[];
  /** Lower-cased MAC or IP → display name. */
  hostnames: Record<string, string>;
  loading: boolean;
  onForceReload: () => void;
  reloading: boolean;
}) {
  const t = useTranslations("bandwidth");
  const [tab, setTab] = useState("traffic");

  const hosts = useMemo(() => hostRows(rows), [rows]);
  const apps = useMemo(() => layer7Rows(rows), [rows]);
  const v6rows = useMemo(() => ipv6Rows(rows), [rows]);

  const hTotals = useMemo(() => hostTotals(hosts), [hosts]);
  const l7Totals = useMemo(() => layer7Totals(apps), [apps]);
  const v6Totals = useMemo(() => ipv6Totals(v6rows), [v6rows]);

  const other = t("other");
  const nameOf = (rec: NlbwRecord): string => {
    const key = hostKey(rec);
    return hostnames[rec.mac.toLowerCase()] ?? hostnames[rec.ip] ?? (key === OTHER_MAC ? other : "—");
  };

  const fmtPct = (v: number): string => `${v.toFixed(2)}%`;

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="traffic">{t("tabTraffic")}</TabsTrigger>
        <TabsTrigger value="layer7">{t("tabLayer7")}</TabsTrigger>
        <TabsTrigger value="ipv6">{t("tabIpv6")}</TabsTrigger>
        <TabsTrigger value="export">{t("tabExport")}</TabsTrigger>
      </TabsList>

      {/* ---- Traffic Distribution ---- */}
      <TabsContent value="traffic" className="flex min-h-0 flex-col gap-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-8">
              <PiePanel
                label={t("pieTrafficHost")}
                data={trafficPie(hosts)}
                format={nlbwBytes}
              />
              <PiePanel
                label={t("pieConnHost")}
                data={connectionsPie(hosts)}
                format={nlbwCount}
              />
              <ul className="min-w-52 space-y-1.5">
                <Kpi value={hTotals.hosts}>{t("kpiHosts")}</Kpi>
                <Kpi value={nlbwBytes(hTotals.rx)}>{t("kpiDownload")}</Kpi>
                <Kpi value={nlbwBytes(hTotals.tx)}>{t("kpiUpload")}</Kpi>
                <Kpi value={nlbwCount(hTotals.conns)}>{t("kpiConnections")}</Kpi>
              </ul>
            </div>

            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colHost")}</TableHead>
                    <TableHead>{t("colMac")}</TableHead>
                    <TableHead>{t("colConnections")}</TableHead>
                    <TableHead colSpan={2}>{t("colDownload")}</TableHead>
                    <TableHead colSpan={2}>{t("colUpload")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hosts.length === 0 ? (
                    <EmptyRow colspan={7} onForceReload={onForceReload} busy={reloading} />
                  ) : (
                    hosts.map((rec) => (
                      <TableRow key={rec.mac + rec.ip}>
                        <TableCell className="max-w-48 truncate">{nameOf(rec)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {rec.mac.toUpperCase() === OTHER_MAC ? other : rec.mac.toUpperCase()}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwCount(rec.conns)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwBytes(rec.rx_bytes)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {nlbwPackets(rec.rx_pkts)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwBytes(rec.tx_bytes)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {nlbwPackets(rec.tx_pkts)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TabsContent>

      {/* ---- Application Protocols ---- */}
      <TabsContent value="layer7" className="flex min-h-0 flex-col gap-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-8">
              <PiePanel label={t("pieRxApp")} data={layer7RxPie(apps, other)} format={nlbwBytes} />
              <PiePanel label={t("pieTxApp")} data={layer7TxPie(apps, other)} format={nlbwBytes} />
              <ul className="min-w-52 space-y-1.5">
                <Kpi value={l7Totals.total}>{t("kpiProtocols")}</Kpi>
                <Kpi value={l7Totals.topRx.join(", ") || "—"}>{t("kpiMostRx")}</Kpi>
                <Kpi value={l7Totals.topTx.join(", ") || "—"}>{t("kpiMostTx")}</Kpi>
                <Kpi value={l7Totals.topConn.join(", ") || "—"}>{t("kpiMostConn")}</Kpi>
              </ul>
            </div>

            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colApplication")}</TableHead>
                    <TableHead>{t("colConnections")}</TableHead>
                    <TableHead colSpan={2}>{t("colDownload")}</TableHead>
                    <TableHead colSpan={2}>{t("colUpload")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.length === 0 ? (
                    <EmptyRow colspan={6} onForceReload={onForceReload} busy={reloading} />
                  ) : (
                    apps.map((rec, i) => (
                      <TableRow key={`${rec.layer7 || "other"}-${i}`}>
                        <TableCell>{rec.layer7 || other}</TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwCount(rec.conns)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwBytes(rec.rx_bytes)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {nlbwPackets(rec.rx_pkts)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{nlbwBytes(rec.tx_bytes)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {nlbwPackets(rec.tx_pkts)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TabsContent>

      {/* ---- IPv6 ---- */}
      <TabsContent value="ipv6" className="flex min-h-0 flex-col gap-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-8">
              <PiePanel label={t("pieV4V6")} data={ipv6SharePie(v6Totals)} format={nlbwBytes} />
              <PiePanel
                label={t("pieDualstack")}
                data={ipv6HostsPie(v6Totals, {
                  v4: t("hostsV4Only", { count: v6Totals.v4Only }),
                  v6: t("hostsV6Only", { count: v6Totals.v6Only }),
                  dual: t("hostsDual", { count: v6Totals.dualStack }),
                })}
                format={nlbwCount}
              />
              <ul className="min-w-52 space-y-1.5">
                <Kpi value={fmtPct(v6Totals.hostRate)}>{t("kpiIpv6Hosts")}</Kpi>
                <Kpi value={fmtPct(v6Totals.trafficShare)}>{t("kpiIpv6Share")}</Kpi>
                <Kpi value={nlbwBytes(v6Totals.rx6)}>{t("kpiIpv6Rx")}</Kpi>
                <Kpi value={nlbwBytes(v6Totals.tx6)}>{t("kpiIpv6Tx")}</Kpi>
              </ul>
            </div>

            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colHost")}</TableHead>
                    <TableHead>{t("colMac")}</TableHead>
                    <TableHead>{t("colFamily")}</TableHead>
                    <TableHead colSpan={2}>{t("colDownload")}</TableHead>
                    <TableHead colSpan={2}>{t("colUpload")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v6Totals.hosts.length === 0 ? (
                    <EmptyRow colspan={7} onForceReload={onForceReload} busy={reloading} />
                  ) : (
                    v6Totals.hosts.flatMap((host) =>
                      (["v4", "v6"] as const).map((fam) => {
                        const rec = fam === "v4" ? host.v4 : host.v6;
                        return (
                          <TableRow key={`${host.mac}-${fam}`}>
                            {fam === "v4" ? (
                              <>
                                <TableCell rowSpan={2} className="max-w-48 truncate align-top">
                                  {hostnames[host.mac.toLowerCase()] ?? "—"}
                                </TableCell>
                                <TableCell rowSpan={2} className="align-top font-mono text-xs">
                                  {host.mac}
                                </TableCell>
                              </>
                            ) : null}
                            <TableCell className="text-xs">{fam === "v4" ? "IPv4" : "IPv6"}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {rec ? nlbwBytes(rec.rx_bytes) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs tabular-nums">
                              {rec ? nlbwPackets(rec.rx_pkts) : "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {rec ? nlbwBytes(rec.tx_bytes) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs tabular-nums">
                              {rec ? nlbwPackets(rec.tx_pkts) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      }),
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TabsContent>

      {/* ---- Export ---- */}
      <TabsContent value="export" className="space-y-3">
        <ul className="space-y-2">
          {EXPORTS.map((e) => (
            <li key={e.key}>
              <Button variant="link" size="sm" className="h-auto justify-start p-0" asChild>
                <a href={`/api/bandwidth/data?${e.query}`} download>
                  <DownloadIcon className="size-3.5" />
                  {t(e.label)}
                </a>
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onForceReload} disabled={reloading}>
            <RefreshCwIcon className={reloading ? "size-4 animate-spin" : "size-4"} />
            {t("forceReload")}
          </Button>
          <span className="text-muted-foreground text-xs">{t("forceReloadHint")}</span>
        </div>
      </TabsContent>
    </Tabs>
  );
}
