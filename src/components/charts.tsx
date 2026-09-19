"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBytes, formatRate } from "@/lib/format";

function timeLabel(t: number): string {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type TipUnit = "percent" | "rate" | "number" | "bytes";

type TipProps = {
  active?: boolean;
  label?: number;
  payload?: { name?: string; dataKey?: string | number; value?: number; color?: string }[];
  unit?: TipUnit;
};

function formatTipValue(value: number, unit?: TipUnit): string {
  if (unit === "rate") return formatRate(value);
  if (unit === "bytes") return formatBytes(value);
  if (unit === "number") return value.toFixed(2);
  return `${value.toFixed(1)}%`;
}

function ChartTooltip({ active, label, payload, unit }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{timeLabel(Number(label))}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 font-medium tabular-nums">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: p.color ?? "var(--chart-1)" }}
          />
          {p.name ? <span className="text-muted-foreground font-normal">{p.name}</span> : null}
          {formatTipValue(Number(p.value), unit)}
        </p>
      ))}
    </div>
  );
}

const axisTick = { fontSize: 10, fill: "var(--muted-foreground)" };

export function CpuChart({
  data,
  color = "var(--chart-1)",
  height = 180,
}: {
  data: { t: number; cpu: number }[];
  color?: string;
  /** Number of pixels, or `"100%"` to fill a sized flex parent. */
  height?: number | `${number}%`;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={timeLabel}
          tick={axisTick}
          minTickGap={48}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={axisTick}
          width={44}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip content={<ChartTooltip unit="percent" />} />
        <Area
          type="monotone"
          dataKey="cpu"
          stroke={color}
          strokeWidth={2}
          fill="url(#cpuFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TrafficChart({
  data,
  height = 180,
}: {
  data: { t: number; rx: number; tx: number }[];
  height?: number | `${number}%`;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rxFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={timeLabel}
          tick={axisTick}
          minTickGap={48}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={axisTick}
          width={64}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatRate(v)}
        />
        <Tooltip content={<ChartTooltip unit="rate" />} />
        <Area
          type="monotone"
          dataKey="rx"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#rxFill)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="tx"
          stroke="var(--chart-4)"
          strokeWidth={2}
          fill="url(#txFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LoadChart({
  data,
  names,
  height = 180,
}: {
  data: { t: number; l1: number; l5: number; l15: number }[];
  names?: { l1?: string; l5?: string; l15?: string };
  height?: number | `${number}%`;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={timeLabel}
          tick={axisTick}
          minTickGap={48}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, "auto"]}
          tick={axisTick}
          width={44}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip content={<ChartTooltip unit="number" />} />
        <Line
          type="monotone"
          dataKey="l1"
          name={names?.l1}
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="l5"
          name={names?.l5}
          stroke="var(--chart-3)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="l15"
          name={names?.l15}
          stroke="var(--chart-5)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MemoryChart({
  data,
  name,
  height = 180,
}: {
  data: { t: number; memUsed: number }[];
  name?: string;
  height?: number | `${number}%`;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={timeLabel}
          tick={axisTick}
          minTickGap={48}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, "auto"]}
          tick={axisTick}
          width={64}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatBytes(v)}
        />
        <Tooltip content={<ChartTooltip unit="bytes" />} />
        <Area
          type="monotone"
          dataKey="memUsed"
          name={name}
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#memFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

type DonutSlice = { name: string; value: number; color: string };

type DonutTipProps = {
  active?: boolean;
  payload?: { payload?: DonutSlice; value?: number; name?: string }[];
  /** Formats the slice value for the tooltip, e.g. bytes or packets. */
  format?: (value: number) => string;
};

function DonutTooltip({ active, payload, format }: DonutTipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  if (!slice) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="flex items-center gap-2 font-medium tabular-nums">
        <span className="inline-block size-2 rounded-full" style={{ background: slice.color }} />
        <span className="max-w-56 truncate">{slice.name}</span>
        {format ? format(slice.value) : slice.value}
      </p>
    </div>
  );
}

/**
 * Doughnut chart matching the official nlbwmon pies: 30 % inner cutout, one
 * thin-stroked segment per slice and slice colours supplied by the caller.
 */
export function DonutChart({
  data,
  format,
  size = 200,
}: {
  data: DonutSlice[];
  format?: (value: number) => string;
  size?: number;
}) {
  return (
    <ResponsiveContainer width={size} height={size}>
      <PieChart>
        <Tooltip content={<DonutTooltip format={format} />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="30%"
          outerRadius="100%"
          stroke="var(--background)"
          strokeWidth={1}
          isAnimationActive={false}
        >
          {data.map((s) => (
            <Cell key={`${s.name}-${s.color}`} fill={s.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
