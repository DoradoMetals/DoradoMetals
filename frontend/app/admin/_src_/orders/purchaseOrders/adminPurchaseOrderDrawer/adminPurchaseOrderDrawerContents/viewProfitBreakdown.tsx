'use client'

import { useState } from 'react'
import { Accordion, Amount, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger } from '@dorado/components'

// The breakdown is the server's admin-only quote (POST /quotes/
// profit_breakdown) - the last client money math (computePurchaseOrderTotals)
// died here 2026-08-28.
import { useProfitBreakdown } from '@/shared/hooks/quotes/queries'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'
import { ProfitParty, ProfitCategory } from '@dorado/contracts'

type Party = ProfitParty
type Bucket = ProfitCategory

export default function ProfitBreakdown({ view }: PurchaseOrderDrawerContentProps) {
  const { data: breakdown } = useProfitBreakdown(view.order.id)

  const sharesFor = (party: Party, bucket: Bucket) =>
    breakdown ? breakdown.shares.filter((s) => s.party === party && s.category === bucket) : []

  const bucketHasAnyContent = (b: Bucket) => {
    if (!breakdown) return false
    const parties: Party[] = ['customer', 'dorado', 'refiner']
    return parties.some((party) => sharesFor(party, b).some((s) => s.content > 0))
  }

  const availableBuckets = (['scrap', 'bullion', 'total'] as Bucket[]).filter(bucketHasAnyContent)

  // WHICH TAB IS OPEN IS DERIVED, NOT CORRECTED AFTER THE FACT. An effect used
  // to notice the chosen tab had no content and set a different one, so the
  // first render showed an empty table and the second showed the right one.
  const [picked, setPicked] = useState<Bucket>('total')
  const tab = availableBuckets.includes(picked) ? picked : (availableBuckets[0] ?? 'total')

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
  if (!breakdown || availableBuckets.length === 0) {
    return (
      <div className="flex w-full h-full">
        <p>No items to display.</p>
      </div>
    )
  }

  // parties[] carries totals for the whole order, not per bucket, so the
  // non-total buckets have no server number to read - they sum their own rows.
  const bucketTotal = (party: Party, bucket: Bucket) => {
    const partyTotal = breakdown.parties.find((p) => p.party === party)
    if (bucket === 'total') return partyTotal?.total_profit ?? 0
    return sharesFor(party, bucket).reduce((sum, s) => sum + s.profit, 0)
  }

  const renderTableBody = (party: Party, bucket: Bucket) => {
    const shares = sharesFor(party, bucket)
    if (shares.length === 0) return null

    const partyTotal = breakdown.parties.find((p) => p.party === party)
    const showShipping = bucket === 'total' && (partyTotal?.shipping_net ?? 0) !== 0
    const showFee = bucket === 'total' && (partyTotal?.refiner_fee_net ?? 0) !== 0
    const showSpotNet =
      bucket === 'total' && party === 'dorado' && (partyTotal?.spot_net ?? 0) !== 0
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
          {shares.map((s) => (
            <TableRow key={s.metal_id}>
              <TableCell className="text-left">
                {bucket === 'total' ? `${s.metal_id} Net` : s.metal_id}
              </TableCell>
              <TableCell className="text-center">{s.content.toFixed(3)} toz</TableCell>
              <TableCell className="text-center">{s.percentage.toFixed(2)}%</TableCell>
              <TableCell className="text-right">
                <Amount value={s.profit} />
              </TableCell>
            </TableRow>
          ))}

          {showShipping && (
            <TableRow>
              <TableCell className="text-left">Shipping Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <Amount value={partyTotal!.shipping_net} />
              </TableCell>
            </TableRow>
          )}

          {showFee && (
            <TableRow>
              <TableCell className="text-left">Refiner Fee</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <Amount value={partyTotal!.refiner_fee_net} />
              </TableCell>
            </TableRow>
          )}

          {showSpotNet && (
            <TableRow>
              <TableCell className="text-left">Spot Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <Amount value={partyTotal!.spot_net} />
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
                <Amount value={partyTotal!.total_profit} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    )
  }

  const renderBucket = (bucket: Bucket) => (
    <div className="flex flex-col gap-2">
      <Accordion
        surface="bare"
        label="Dorado"
        trailing={<Amount value={bucketTotal('dorado', bucket)} />}
        open={isOpen(bucket, 'dorado')}
        onToggle={() => toggle(bucket, 'dorado')}
      >
        {renderTableBody('dorado', bucket)}
      </Accordion>

      <Accordion
        surface="bare"
        label="Customer"
        trailing={<Amount value={bucketTotal('customer', bucket)} />}
        open={isOpen(bucket, 'customer')}
        onToggle={() => toggle(bucket, 'customer')}
      >
        {renderTableBody('customer', bucket)}
      </Accordion>

      <Accordion
        surface="bare"
        label="Refiner"
        trailing={<Amount value={bucketTotal('refiner', bucket)} />}
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

        <Tabs value={tab} onValueChange={(v) => setPicked(v as Bucket)} className="w-full">
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
