'use client'

import { useEffect, useState } from 'react'
import { Accordion, Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { cn } from '@/shared/utils/cn'

// The breakdown is the server's admin-only quote (POST /quotes/
// profit_breakdown) - the last client money math (computePurchaseOrderTotals)
// died here 2026-08-28.
import { useProfitBreakdown } from '@/features/quotes/queries'
import { PurchaseOrder } from '@/features/orders/purchaseOrders/types'

type Party = 'customer' | 'refiner' | 'dorado'
type Bucket = 'scrap' | 'bullion' | 'total'
type MetalLabel = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
const METALS: MetalLabel[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

export default function ProfitBreakdown({ order }: { order: PurchaseOrder }) {
  const { data: totals } = useProfitBreakdown(order.id)

  const bucketHasAnyContent = (b: Bucket) => {
    if (!totals) return false
    const parties: Party[] = ['customer', 'dorado', 'refiner']
    for (const party of parties) {
      const m = totals[party][b]
      if (
        m.gold.content > 0 ||
        m.silver.content > 0 ||
        m.platinum.content > 0 ||
        m.palladium.content > 0
      )
        return true
    }
    return false
  }

  const availableBuckets = (['scrap', 'bullion', 'total'] as Bucket[]).filter(bucketHasAnyContent)

  const [tab, setTab] = useState<Bucket>('total')
  useEffect(() => {
    if (!availableBuckets.includes(tab) && availableBuckets.length > 0) {
      setTab(availableBuckets[0])
    }
  }, [availableBuckets, tab])

  type OpenMap = Record<Bucket, Party | null>
  const [openByBucket, setOpenByBucket] = useState<OpenMap>({
    scrap: 'dorado',
    bullion: 'dorado',
    total: 'dorado',
  })
  const isOpen = (bucket: Bucket, party: Party) => openByBucket[bucket] === party
  const toggle = (bucket: Bucket, party: Party) =>
    setOpenByBucket((prev) => ({
      ...prev,
      [bucket]: prev[bucket] === party ? null : party,
    }))

  // After every hook, so the guard cannot reorder them: nothing to show until
  // the server's breakdown lands (and nothing at all for an empty order).
  if (!totals || availableBuckets.length === 0) {
    return (
      <div className="flex w-full h-full">
        <p>No items to display.</p>
      </div>
    )
  }

  const renderTableBody = (party: Party, bucket: Bucket) => {
    const data = totals[party][bucket]
    const metals = data

    // visible metals = those with content > 0 (no math other than boolean checks)
    const visibleMetals = METALS.filter((label) => {
      if (label === 'Gold') return metals.gold.content > 0
      if (label === 'Silver') return metals.silver.content > 0
      if (label === 'Platinum') return metals.platinum.content > 0
      return metals.palladium.content > 0
    })
    if (visibleMetals.length === 0) return null

    const pick = (label: MetalLabel) => {
      switch (label) {
        case 'Gold':
          return metals.gold
        case 'Silver':
          return metals.silver
        case 'Platinum':
          return metals.platinum
        case 'Palladium':
          return metals.palladium
      }
    }

    const showShipping = bucket === 'total' && (totals[party].shipping_net ?? 0) !== 0
    const showFee = bucket === 'total' && (totals[party].refiner_fee_net ?? 0) !== 0
    const showSpotNet =
      bucket === 'total' && party === 'dorado' && (totals.dorado.spot_net ?? 0) !== 0
    const showNetRow = bucket === 'total'
    const label = bucket === 'total' ? 'Type' : 'Metal'

    return (
      <Table className="overflow-hidden">
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">{label}</TableHead>
            <TableHead className="text-center">Content</TableHead>
            <TableHead className="text-center">Percent</TableHead>
            <TableHead className="text-right">Dollars</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleMetals.map((label) => {
            const v = pick(label)!
            return (
              <TableRow key={label}>
                <TableCell className="text-left">
                  {bucket === 'total' ? `${label} Net` : label}
                </TableCell>
                <TableCell className="text-center">{v.content.toFixed(3)} toz</TableCell>
                <TableCell className="text-center">{v.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-right">
                  <PriceNumberFlow value={v.profit} />
                </TableCell>
              </TableRow>
            )
          })}

          {showShipping && (
            <TableRow>
              <TableCell className="text-left">Shipping Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals[party].shipping_net} />
              </TableCell>
            </TableRow>
          )}

          {showFee && (
            <TableRow>
              <TableCell className="text-left">Refiner Fee</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals[party].refiner_fee_net} />
              </TableCell>
            </TableRow>
          )}

          {showSpotNet && (
            <TableRow>
              <TableCell className="text-left">Spot Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals.dorado.spot_net} />
              </TableCell>
            </TableRow>
          )}

          {showNetRow && (
            <TableRow>
              <TableCell className="text-left">
                <strong>Total Net</strong>
              </TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals[party].total_profit} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    )
  }

  const accordionValue = (party: Party, bucket: Bucket) => {
    if (bucket === 'total') return totals[party].total_profit
    const m = totals[party][bucket]
    return (
      (m.gold.profit ?? 0) +
      (m.silver.profit ?? 0) +
      (m.platinum.profit ?? 0) +
      (m.palladium.profit ?? 0)
    )
  }

  const renderBucket = (bucket: Bucket) => (
    <div className="flex flex-col gap-2">
      <Accordion
        surface="bare"
        label="Dorado"
        trailing={<PriceNumberFlow value={accordionValue('dorado', bucket)} />}
        open={isOpen(bucket, 'dorado')}
        onToggle={() => toggle(bucket, 'dorado')}
      >
        {renderTableBody('dorado', bucket)}
      </Accordion>

      <Accordion
        surface="bare"
        label="Customer"
        trailing={<PriceNumberFlow value={accordionValue('customer', bucket)} />}
        open={isOpen(bucket, 'customer')}
        onToggle={() => toggle(bucket, 'customer')}
      >
        {renderTableBody('customer', bucket)}
      </Accordion>

      <Accordion
        surface="bare"
        label="Refiner"
        trailing={<PriceNumberFlow value={accordionValue('refiner', bucket)} />}
        open={isOpen(bucket, 'refiner')}
        onToggle={() => toggle(bucket, 'refiner')}
      >
        {renderTableBody('refiner', bucket)}
      </Accordion>
    </div>
  )

  return (
    <div className="flex w-full">
      <div className="flex flex-col gap-4 w-full">
        <h2>Profit Breakdown</h2>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Bucket)} className="w-full">
          {/* ⚠ D99 — NO TAB LOOKED ACTIVE. Rest was `primary-on-glass`
              (bg-primary/15, border-primary, text-primary); active added
              `text-white`, which is #ffffff against text-primary's #fafafa
              (1.04:1); and inactive's `bg-neutral-200` never applied at all,
              because `.primary-on-glass` lives in an UNLAYERED stylesheet and
              unlayered rules beat every cascade layer including `utilities`.
              So all three triggers rendered the identical pill whichever one
              was selected. `underline` is the variant that exists for this. */}
          <TabsList className="w-full justify-start gap-2">
            {availableBuckets.includes('total') && <TabsTrigger value="total">Total</TabsTrigger>}
            {availableBuckets.includes('scrap') && <TabsTrigger value="scrap">Scrap</TabsTrigger>}
            {availableBuckets.includes('bullion') && (
              <TabsTrigger value="bullion">Bullion</TabsTrigger>
            )}
          </TabsList>

          {availableBuckets.includes('total') && (
            <TabsContent value="total">{renderBucket('total')}</TabsContent>
          )}
          {availableBuckets.includes('scrap') && (
            <TabsContent value="scrap">{renderBucket('scrap')}</TabsContent>
          )}
          {availableBuckets.includes('bullion') && (
            <TabsContent value="bullion">{renderBucket('bullion')}</TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
