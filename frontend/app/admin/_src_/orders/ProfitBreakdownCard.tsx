'use client'

import type { ProfitBreakdown } from '@dorado/contracts'

import { CardHairline, CardRow, OrderCard } from './OrderCard'
import { money, ounces } from './format'

export type ProfitBreakdownCardProps = {
  breakdown: ProfitBreakdown | null
  loading?: boolean
}

export function ProfitBreakdownCard({ breakdown, loading = false }: ProfitBreakdownCardProps) {
  const dorado = breakdown?.parties.find((party) => party.party === 'dorado') ?? null
  const shares = (breakdown?.shares ?? []).filter(
    (share) => share.party === 'dorado' && share.category === 'total'
  )

  return (
    <OrderCard title="Profit Breakdown" summary={money(dorado?.total_profit ?? null)}>
      {loading ? (
        <p className="text-small text-muted-foreground">Pricing…</p>
      ) : (
        <>
          {shares.map((share) => (
            <CardRow
              key={share.metal_id}
              label={`${share.metal_id}  ·  ${ounces(share.content)}`}
              value={money(share.profit)}
            />
          ))}
          {shares.length > 0 && <CardHairline />}
          <CardRow label="Metals" value={money(dorado?.metals_profit ?? null)} />
          <CardRow label="Spot" value={money(dorado?.spot_net ?? null)} />
          <CardRow label="Shipping" value={money(dorado?.shipping_net ?? null)} />
          <CardRow label="Refiner fee" value={money(dorado?.refiner_fee_net ?? null)} />
          <CardHairline />
          <div className="flex w-full items-center justify-between gap-md">
            <p className="text-small font-medium text-foreground">Profit</p>
            <p className="text-right text-stat-sm font-semibold text-foreground">
              {money(dorado?.total_profit ?? null)}
            </p>
          </div>
        </>
      )}
    </OrderCard>
  )
}
