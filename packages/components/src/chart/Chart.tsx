'use client'

import * as React from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import { cn } from "../cn";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  ChartTooltip,
);

function tokenColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const C = {
  get fg() { return tokenColor("--color-foreground", "#f6f7f9"); },
  get mutedForeground() { return tokenColor("--color-muted-foreground", "#9499a4"); },
  get faint() { return tokenColor("--color-placeholder", "#787c87"); },
  get border() { return tokenColor("--color-border", "#2c2f35"); },
  get borderStrong() { return tokenColor("--color-border-strong", "#3f434b"); },
  get muted() { return tokenColor("--color-muted", "#1e2024"); },
  get primary() { return tokenColor("--color-primary", "#fafafa"); },
  get info() { return tokenColor("--color-info", "#3eaef4"); },
  get success() { return tokenColor("--color-success", "#3ecc89"); },
  get destructive() { return tokenColor("--color-destructive", "#ec5165"); },
};

const baseScales = {
  x: { grid: { color: C.border }, ticks: { color: C.mutedForeground, font: { size: 12 } }, border: { color: C.border } },
  y: { grid: { color: C.border }, ticks: { color: C.mutedForeground, font: { size: 12 } }, border: { display: false } },
};
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
} as const;

export type Series = { label: string; data: number[] };

type ChartBaseProps = {
  labels: string[];
  series: Series[];
  label: string;
  title?: string;
  className?: string;
};

function ChartCard({ title, className, children }: { title?: string; className?: string; children: React.ReactNode }) {
  if (!title) {
    return <div className={cn("relative w-full", className)}>{children}</div>;
  }
  return (
    <div className={cn("flex w-full flex-col gap-md rounded-lg border border-border bg-card p-md", className)}>
      <h3 className="text-h5 text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function LineChart({ labels, series, label, title, className, area = false }: ChartBaseProps & { area?: boolean }) {
  const last = (series[0]?.data.length ?? 1) - 1;
  return (
    <ChartCard title={title} className={className}>
      <div className="relative h-[200px] w-full">
        <Line
          aria-label={label}
          role="img"
          options={{ ...baseOptions, scales: baseScales }}
          data={{
            labels,
            datasets: series.map((s, i) => ({
              ...s,
              borderColor: i === 0 ? C.info : C.mutedForeground,
              backgroundColor: area ? "rgba(250,250,250,0.08)" : "transparent",
              fill: area,
              borderWidth: 1.5,
              pointRadius: i === 0 ? s.data.map((_, idx) => (idx === last ? 4 : 0)) : 0,
              pointBackgroundColor: i === 0 ? C.info : C.mutedForeground,
              pointBorderWidth: 0,
              tension: 0.25,
            })),
          }}
        />
      </div>
    </ChartCard>
  );
}

export function AreaChart(props: ChartBaseProps) {
  return <LineChart {...props} area />;
}

export function BarChart({ labels, series, label, title, className }: ChartBaseProps) {
  return (
    <ChartCard title={title} className={className}>
      <div className="relative h-[200px] w-full">
        <Bar
          aria-label={label}
          role="img"
          options={{ ...baseOptions, scales: baseScales }}
          data={{
            labels,
            datasets: series.map((s, i) => ({
              ...s,
              backgroundColor:
                i === 0
                  ? s.data.map((_, idx) => (idx === s.data.length - 1 ? C.primary : C.borderStrong))
                  : C.mutedForeground,
              borderRadius: 4,
            })),
          }}
        />
      </div>
    </ChartCard>
  );
}

export function DonutChart({
  labels,
  data,
  label,
  className,
}: { labels: string[]; data: number[]; label: string; className?: string }) {
  const palette = [C.primary, C.mutedForeground, C.muted];
  return (
    <div className={cn("relative h-48 w-full", className)}>
      <Doughnut
        aria-label={label}
        role="img"
        options={{ ...baseOptions, cutout: "72%" }}
        data={{ labels, datasets: [{ data, backgroundColor: palette.slice(0, data.length), borderWidth: 0 }] }}
      />
    </div>
  );
}

export function Sparkline({
  data,
  label,
  className,
}: { data: number[]; label: string; className?: string }) {
  const up = data.length > 1 && data[data.length - 1] >= data[0];
  return (
    <div className={cn("relative h-10 w-28", className)}>
      <Line
        aria-label={label}
        role="img"
        options={{
          ...baseOptions,
          scales: { x: { display: false }, y: { display: false } },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        }}
        data={{
          labels: data.map((_, i) => String(i)),
          datasets: [{
            data,
            borderColor: up ? C.success : C.destructive,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
          }],
        }}
      />
    </div>
  );
}
