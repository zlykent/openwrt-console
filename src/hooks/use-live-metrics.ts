"use client";

import { useEffect, useRef, useState } from "react";
import { useStats } from "./use-openwrt";
import type { StatsSample } from "@/lib/openwrt/types";
import { isPhysicalInterface } from "@/lib/format";

export type MetricPoint = {
  t: number;
  cpu: number;
  rx: number;
  tx: number;
  l1: number;
  l5: number;
  l15: number;
  memUsed: number;
  memTotal: number;
};

export type IfacePoint = { t: number; rx: number; tx: number };

export type PerIfaceRate = { name: string; rx: number; tx: number };

/**
 * Turns the polled `StatsSample` stream into derived live metrics:
 * - CPU % from the delta of idle/total jiffies between two samples.
 * - Aggregate + per-interface rx/tx rates from byte-counter deltas.
 * - A rolling history array for charts.
 */
export function useLiveMetrics(intervalMs: number | false = 3000, historyLength = 40) {
  const query = useStats(intervalMs);
  const prev = useRef<StatsSample | null>(null);
  const [cpu, setCpu] = useState(0);
  const [rate, setRate] = useState({ rx: 0, tx: 0 });
  const [perIface, setPerIface] = useState<PerIfaceRate[]>([]);
  const [series, setSeries] = useState<MetricPoint[]>([]);
  const [perIfaceSeries, setPerIfaceSeries] = useState<Record<string, IfacePoint[]>>({});
  const [interfaces, setInterfaces] = useState<string[]>([]);

  useEffect(() => {
    const sample = query.data;
    if (!sample) return;
    const p = prev.current;
    prev.current = sample;
    if (!p) return;

    const dt = Math.max(1, (sample.at - p.at) / 1000);
    const dTotal = sample.cpu.total - p.cpu.total;
    const dIdle = sample.cpu.idle - p.cpu.idle;
    const cpuPct = dTotal > 0 ? Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100)) : 0;

    let rx = 0;
    let tx = 0;
    const ifaceRates: PerIfaceRate[] = [];
    for (const [name, cur] of Object.entries(sample.interfaces)) {
      const old = p.interfaces[name];
      if (!old) continue;
      const dRx = Math.max(0, cur.rxBytes - old.rxBytes) / dt;
      const dTx = Math.max(0, cur.txBytes - old.txBytes) / dt;
      ifaceRates.push({ name, rx: dRx, tx: dTx });
      if (isPhysicalInterface(name)) {
        rx += dRx;
        tx += dTx;
      }
    }

    const load = sample.load;
    const memUsed = sample.memory?.used ?? 0;
    const memTotal = sample.memory?.total ?? 0;

    setCpu(cpuPct);
    setRate({ rx, tx });
    setPerIface(ifaceRates);
    setSeries((s) => [
      ...s.slice(-(historyLength - 1)),
      {
        t: sample.at,
        cpu: cpuPct,
        rx,
        tx,
        l1: load?.[0] ?? 0,
        l5: load?.[1] ?? 0,
        l15: load?.[2] ?? 0,
        memUsed,
        memTotal,
      },
    ]);

    // Per-interface traffic history (physical interfaces only) for realtime graphs.
    const physNames: string[] = [];
    const latestPerIface: Record<string, IfacePoint> = {};
    for (const r of ifaceRates) {
      if (!isPhysicalInterface(r.name)) continue;
      physNames.push(r.name);
      latestPerIface[r.name] = { t: sample.at, rx: r.rx, tx: r.tx };
    }
    setInterfaces(physNames);
    setPerIfaceSeries((prevSeries) => {
      const next: Record<string, IfacePoint[]> = {};
      for (const [name, point] of Object.entries(latestPerIface)) {
        const arr = prevSeries[name] ?? [];
        next[name] = [...arr.slice(-(historyLength - 1)), point];
      }
      return next;
    });
  }, [query.data, historyLength]);

  return { ...query, cpu, rate, perIface, series, perIfaceSeries, interfaces };
}
