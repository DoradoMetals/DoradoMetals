import { CHART_RANGES, LineChart } from '@dorado/components'
import type { SpotCandleRange } from '@dorado/contracts'

import { formatAxisMoney } from '../../_lib'
import { RANGE_TITLES } from '../_lib'

export type HistoryChartProps = {
  metalId: string
  range: SpotCandleRange
  labels: string[]
  closes: number[]
  className?: string
  onRangeChange: (range: SpotCandleRange) => void
}

export function HistoryChart({
  metalId,
  range,
  labels,
  closes,
  className,
  onRangeChange,
}: HistoryChartProps) {
  return (
    <LineChart
      title={`${metalId} spot, ${RANGE_TITLES[range]}`}
      label={`${metalId} bid, ${RANGE_TITLES[range]}`}
      labels={labels}
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
