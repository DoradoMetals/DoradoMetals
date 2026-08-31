'use client'

// Chart - the Figma page (57:2, extended 2026-08-30 with Area/Donut/
// Sparkline). Chart.js underneath (Jacob's default, agreed): one registration,
// theme-token colours passed in as resolved values by the caller or defaulted
// here, and every chart carries an accessible name. The Sparkline is the
// chartless chart: no axes, no grid, no border - for Stat cells and rows.
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

// A canvas needs RESOLVED colours, so the tokens are read from the theme at
// runtime (getComputedStyle on the root) - the hex literals are only the
// SSR/test fallback, and they mirror @dorado/theme's dark values (the
// no-random-hex rule with the one honest exception a canvas forces).
function tokenColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const C = {
  get fg() { return tokenColor("--color-foreground", "#f6f7f9"); },
  get muted() { return tokenColor("--color-muted-foreground", "#9499a4"); },
  get faint() { return tokenColor("--color-placeholder", "#787c87"); },
  get grid() { return "rgba(44,47,53,0.6)"; },
  get primary() { return tokenColor("--color-primary", "#fafafa"); },
  get success() { return tokenColor("--color-success", "#3ecc89"); },
  get destructive() { return tokenColor("--color-destructive", "#ec5165"); },
};

const baseScales = {
  x: { grid: { color: C.grid }, ticks: { color: C.faint, font: { size: 11 } }, border: { color: C.grid } },
  y: { grid: { color: C.grid }, ticks: { color: C.faint, font: { size: 11 } }, border: { display: false } },
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
  /** The accessible name - required; a canvas is a black hole to AT. */
  label: string;
  className?: string;
};

export function LineChart({ labels, series, label, className, area = false }: ChartBaseProps & { area?: boolean }) {
  return (
    <div className={cn("relative h-48 w-full", className)}>
      <Line
        aria-label={label}
        role="img"
        options={{ ...baseOptions, scales: baseScales }}
        data={{
          labels,
          datasets: series.map((s, i) => ({
            ...s,
            borderColor: i === 0 ? C.primary : C.muted,
            backgroundColor: area ? "rgba(250,250,250,0.08)" : "transparent",
            fill: area,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.25,
          })),
        }}
      />
    </div>
  );
}

export function AreaChart(props: ChartBaseProps) {
  return <LineChart {...props} area />;
}

export function BarChart({ labels, series, label, className }: ChartBaseProps) {
  return (
    <div className={cn("relative h-48 w-full", className)}>
      <Bar
        aria-label={label}
        role="img"
        options={{ ...baseOptions, scales: baseScales }}
        data={{
          labels,
          datasets: series.map((s, i) => ({
            ...s,
            backgroundColor: i === 0 ? C.primary : C.muted,
            borderRadius: 3,
          })),
        }}
      />
    </div>
  );
}

export function DonutChart({
  labels,
  data,
  label,
  className,
}: { labels: string[]; data: number[]; label: string; className?: string }) {
  // 2-3 segments max - more than three becomes a Table (the drawing's rule).
  const palette = [C.primary, C.muted, "#1e2024"];
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
