'use client'

import * as React from 'react'
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
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

import { Chip } from '../chip/Chip'
import { cn } from '../cn'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  ChartTooltip
)

function tokenColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
const C = {
  get fg() {
    return tokenColor('--color-foreground', '#f6f7f9')
  },
  get mutedForeground() {
    return tokenColor('--color-muted-foreground', '#9499a4')
  },
  get subtle() {
    return tokenColor('--color-subtle', '#b8bcc4')
  },
  get border() {
    return tokenColor('--color-border', '#2c2f35')
  },
  get borderStrong() {
    return tokenColor('--color-border-strong', '#3f434b')
  },
  get muted() {
    return tokenColor('--color-muted', '#1e2024')
  },
  get primary() {
    return tokenColor('--color-primary', '#fafafa')
  },
  get success() {
    return tokenColor('--color-success', '#3ecc89')
  },
  get destructive() {
    return tokenColor('--color-destructive', '#ec5165')
  },
}

function tokenLength(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const root = getComputedStyle(document.documentElement)
  const v = root.getPropertyValue(name).trim()
  const n = parseFloat(v)
  if (Number.isNaN(n)) return fallback
  return v.endsWith('rem') ? n * (parseFloat(root.fontSize) || 16) : n
}

export type ChartDomain = {
  x: number[]
  min: number
  max: number
  format?: (value: number) => string
}

function axisScales(yAxis: boolean, yFormat?: (value: number) => string, domain?: ChartDomain) {
  return {
    x: {
      ...(domain ? { type: 'linear' as const, min: domain.min, max: domain.max } : {}),
      grid: { display: false },
      ticks: {
        color: C.mutedForeground,
        font: { size: 12 },
        ...(domain?.format
          ? { callback: (value: string | number) => domain.format?.(Number(value)) }
          : {}),
      },
      border: { display: false },
    },
    y: {
      grid: { color: C.border },
      ticks: {
        display: yAxis,
        color: C.subtle,
        font: { size: 12 },
        ...(yFormat ? { callback: (value: string | number) => yFormat(Number(value)) } : {}),
      },
      border: { display: false },
      afterFit: (scale: { width: number }) => {
        scale.width = yAxis ? tokenLength('--chart-axis-y', 48) : 0
      },
    },
  }
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
} as const

export type Series = { label: string; data: number[] }

type ChartBaseProps = {
  labels: string[]
  series: Series[]
  label: string
  title?: string
  className?: string
}

export const CHART_RANGES = ['1D', '1W', '1M', '1Y'] as const

type AxisChartProps = ChartBaseProps & {
  yAxis?: boolean
  yFormat?: (value: number) => string
  domain?: ChartDomain
  range?: string
  onRangeChange?: (range: string) => void
  rangeOptions?: readonly string[]
}

function ChartRange({
  value,
  onChange,
  options,
}: {
  value?: string
  onChange: (range: string) => void
  options: readonly string[]
}) {
  return (
    <div role="group" aria-label="Range" className="flex w-full flex-wrap items-center gap-xs">
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={option === value}
          onClick={() => onChange(option)}
        />
      ))}
    </div>
  )
}

function ChartCard({
  title,
  className,
  range,
  children,
}: {
  title?: string
  className?: string
  range?: React.ReactNode
  children: React.ReactNode
}) {
  if (!title) {
    return (
      <div className={cn('relative flex w-full flex-col gap-md', className)}>
        {range}
        {children}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-md rounded-lg border border-border bg-card p-md',
        className
      )}
    >
      <h3 className="text-h5 text-foreground">{title}</h3>
      {range}
      {children}
    </div>
  )
}

function rangeSlot({
  range,
  onRangeChange,
  rangeOptions = CHART_RANGES,
}: Pick<AxisChartProps, 'range' | 'onRangeChange' | 'rangeOptions'>) {
  if (!onRangeChange) return undefined
  return <ChartRange value={range} onChange={onRangeChange} options={rangeOptions} />
}

function LineSeriesChart({
  labels,
  series,
  label,
  title,
  className,
  area,
  yAxis = false,
  yFormat,
  domain,
  range,
  onRangeChange,
  rangeOptions,
}: AxisChartProps & { area: boolean }) {
  const last = (series[0]?.data.length ?? 1) - 1
  return (
    <ChartCard
      title={title}
      className={className}
      range={rangeSlot({ range, onRangeChange, rangeOptions })}
    >
      <div className="relative h-50 w-full">
        <Line
          aria-label={label}
          role="img"
          options={{ ...baseOptions, scales: axisScales(yAxis, yFormat, domain) }}
          data={{
            labels: domain ? undefined : labels,
            datasets: series.map((s, i) => ({
              ...s,
              data: domain ? s.data.map((y, idx) => ({ x: domain.x[idx], y })) : s.data,
              borderColor: i === 0 ? C.primary : C.mutedForeground,
              backgroundColor: area
                ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                : 'transparent',
              fill: area,
              borderWidth: area ? 1.5 : 2,
              pointRadius: i === 0 ? s.data.map((_, idx) => (idx === last ? 4 : 0)) : 0,
              pointBackgroundColor: i === 0 ? C.primary : C.mutedForeground,
              pointBorderWidth: 0,
              tension: 0.25,
            })),
          }}
        />
      </div>
    </ChartCard>
  )
}

export function LineChart(props: AxisChartProps) {
  return <LineSeriesChart {...props} area={false} />
}

export function AreaChart(props: ChartBaseProps) {
  return <LineSeriesChart {...props} area />
}

export function BarChart({
  labels,
  series,
  label,
  title,
  className,
  yAxis = false,
  range,
  onRangeChange,
  rangeOptions,
}: AxisChartProps) {
  return (
    <ChartCard
      title={title}
      className={className}
      range={rangeSlot({ range, onRangeChange, rangeOptions })}
    >
      <div className="relative h-50 w-full">
        <Bar
          aria-label={label}
          role="img"
          options={{ ...baseOptions, scales: axisScales(yAxis) }}
          data={{
            labels,
            datasets: series.map((s, i) => ({
              ...s,
              backgroundColor:
                i === 0
                  ? s.data.map((_, idx) => (idx === s.data.length - 1 ? C.primary : C.borderStrong))
                  : C.mutedForeground,
              borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
            })),
          }}
        />
      </div>
    </ChartCard>
  )
}

export function DonutChart({
  labels,
  data,
  label,
  className,
}: {
  labels: string[]
  data: number[]
  label: string
  className?: string
}) {
  const palette = [C.primary, C.mutedForeground, C.muted]
  return (
    <div className={cn('relative h-48 w-full', className)}>
      <Doughnut
        aria-label={label}
        role="img"
        options={{ ...baseOptions, cutout: '72%' }}
        data={{
          labels,
          datasets: [{ data, backgroundColor: palette.slice(0, data.length), borderWidth: 0 }],
        }}
      />
    </div>
  )
}

export function Sparkline({
  data,
  label,
  direction,
  domain,
  className,
}: {
  data: number[]
  label: string
  direction?: 'up' | 'down'
  domain?: ChartDomain
  className?: string
}) {
  const up = direction ? direction === 'up' : data.length > 1 && data[data.length - 1] >= data[0]
  return (
    <div className={cn('relative h-10 w-30', className)}>
      <Line
        aria-label={label}
        role="img"
        options={{
          ...baseOptions,
          scales: {
            x: domain
              ? { type: 'linear' as const, display: false, min: domain.min, max: domain.max }
              : { display: false },
            y: { display: false },
          },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        }}
        data={{
          labels: domain ? undefined : data.map((_, i) => String(i)),
          datasets: [
            {
              data: domain ? data.map((y, idx) => ({ x: domain.x[idx], y })) : data,
              borderColor: up ? C.success : C.destructive,
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.3,
            },
          ],
        }}
      />
    </div>
  )
}
