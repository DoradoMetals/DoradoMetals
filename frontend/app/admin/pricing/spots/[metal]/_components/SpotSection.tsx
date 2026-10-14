import { Accordion, Amount, Text } from '@dorado/components'
import type { MetalSpot } from '@dorado/contracts'

import { formatChange, formatMoney } from '../../../_lib'
import { changeTone } from '../../_lib'

function Figure({
  label,
  value,
  dollars,
  pct,
}: {
  label: string
  value: number | null
  dollars: number | null
  pct: number | null
}) {
  return (
    <div className="flex items-end justify-between gap-xs py-xs">
      <div className="flex flex-col gap-3xs">
        <Text variant="micro">{label}</Text>
        {value == null ? (
          <Text variant="stat-sm">—</Text>
        ) : (
          <Amount tag="stat-sm" value={value} format={{ style: 'currency', currency: 'USD' }} />
        )}
      </div>
      <Text variant="small-medium" className={changeTone(dollars)}>
        {formatChange(dollars, pct, true)}
      </Text>
    </div>
  )
}

export function SpotSection({ metal, className }: { metal: MetalSpot; className?: string }) {
  return (
    <Accordion
      label="Spot"
      trailing={formatMoney(metal.ask)}
      defaultOpen
      flush
      className={className}
    >
      <div className="flex flex-col px-md pb-md">
        <Figure
          label="Bid"
          value={metal.bid}
          dollars={metal.bid_dollar_change}
          pct={metal.bid_percent_change}
        />
        <Figure
          label="Ask"
          value={metal.ask}
          dollars={metal.ask_dollar_change}
          pct={metal.ask_percent_change}
        />
      </div>
    </Accordion>
  )
}
