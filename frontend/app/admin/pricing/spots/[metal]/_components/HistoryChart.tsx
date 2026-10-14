import { CHART_RANGES, LineChart, type ChartDomain } from '@dorado/components'
import type { SpotCandleRange } from '@dorado/contracts'

import { formatAxisMoney } from '../../_lib'
import { RANGE_TITLES } from '../_lib'

export type HistoryChartProps = {
  metalId: string
  range: SpotCandleRange
  closes: number[]
  domain: ChartDomain
  className?: string
  onRangeChange: (range: SpotCandleRange) => void
}

export function HistoryChart({
  metalId,
  range,
  closes,
  domain,
  className,
  onRangeChange,
}: HistoryChartProps) {
  return (
    <LineChart
      title={`${metalId} spot, ${RANGE_TITLES[range]}`}
      label={`${metalId} bid, ${RANGE_TITLES[range]}`}
      labels={[]}
      domain={domain}
      series={[{ label: `${metalId} bid`, data: closes }]}
      yAxis
      yFormat={formatAxisMoney}
      range={range}
      rangeOptions={CHART_RANGES}
      onRangeChange={(next) => onRangeChange(next as SpotCandleRange)}
      className={className}
    />
  )
}
