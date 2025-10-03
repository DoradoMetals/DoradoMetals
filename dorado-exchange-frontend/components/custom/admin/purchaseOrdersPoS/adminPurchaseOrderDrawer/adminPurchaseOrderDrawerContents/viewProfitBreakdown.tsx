'use client'

import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { usePurchaseOrderRefinerMetals } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { computePurchaseOrderTotals } from '@/utils/calculatePurchaseOrderTotals'
import { PurchaseOrder, statusConfig } from '@/types/purchase-order'

type Party = 'customer' | 'refiner' | 'dorado'
type Bucket = 'scrap' | 'bullion' | 'total'
type MetalLabel = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
const METALS: MetalLabel[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

function AccordionItem({
  label,
  value,
  children,
  open,
  onToggle,
}: {
  label: string
  value: number
  children: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-md border-border border-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer"
      >
        <span>{label}</span>
        <div className="flex items-center gap-2 text-base text-lg text-neutral-900">
          <PriceNumberFlow value={value} />
          <ChevronDown
            className={cn('h-4 w-4 transition-transform text-neutral-600', open && 'rotate-180')}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-2 pr-9">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ProfitBreakdown({ order }: { order: PurchaseOrder }) {
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const { data: refinerSpotPrices = [] } = usePurchaseOrderRefinerMetals(order.id)
  const config = statusConfig[order.purchase_order_status]

  const totals = computePurchaseOrderTotals(order, orderSpotPrices, refinerSpotPrices)

  const shippingFeeFor = (party: Party, bucket: Bucket) => {
    if (bucket !== 'total') return 0
    if (party === 'customer') return order.shipment?.shipping_charge ?? 0
    if (party === 'dorado') return order.shipping_fee_actual ?? 0
    return 0
  }

  const metalTotalsByBucket: Record<Bucket, Record<MetalLabel, number>> = useMemo(() => {
    const init = () =>
      ({ Gold: 0, Silver: 0, Platinum: 0, Palladium: 0 } as Record<MetalLabel, number>)
    const add = (acc: Record<MetalLabel, number>, src: any) => {
      acc.Gold += src.gold.content ?? 0
      acc.Silver += src.silver.content ?? 0
      acc.Platinum += src.platinum.content ?? 0
      acc.Palladium += src.palladium.content ?? 0
    }

    const buckets: Bucket[] = ['scrap', 'bullion', 'total']
    const out: Record<Bucket, Record<MetalLabel, number>> = {
      scrap: init(),
      bullion: init(),
      total: init(),
    }

    for (const b of buckets) {
      add(out[b], totals.customer[b])
      add(out[b], totals.dorado[b])
      add(out[b], totals.refiner[b])
    }
    return out
  }, [totals])

  const bucketHasAnyContent = (b: Bucket) =>
    METALS.some((m) => (metalTotalsByBucket[b][m] ?? 0) > 0)

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

  const sumPartyGross = (bucket: Bucket, party: Party) => {
    const d = totals[party][bucket]
    return (d.gold.profit ?? 0) + (d.silver.profit ?? 0) + (d.platinum.profit ?? 0) + (d.palladium.profit ?? 0)
  }

  const sumPartyNet = (bucket: Bucket, party: Party) => {
    const gross = sumPartyGross(bucket, party)
    const fee = shippingFeeFor(party, bucket)
    return gross - fee
  }

  const renderTableBody = (party: Party, bucket: Bucket) => {
    const data = totals[party][bucket]
    const visibleMetals = METALS.filter((m) => (metalTotalsByBucket[bucket][m] ?? 0) > 0)
    if (visibleMetals.length === 0) return null

    const pick = (label: MetalLabel) => {
      switch (label) {
        case 'Gold': return data.gold
        case 'Silver': return data.silver
        case 'Platinum': return data.platinum
        case 'Palladium': return data.palladium
      }
    }

    const fee = shippingFeeFor(party, bucket)
    const showFeeRow = bucket === 'total' && fee > 0

    return (
      <Table className="font-normal text-neutral-700 overflow-hidden">
        <TableHeader className="text-sm text-neutral-800 hover:bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-left">Metal</TableHead>
            <TableHead className="text-center">Content</TableHead>
            <TableHead className="text-center">Percent</TableHead>
            <TableHead className="text-right">Dollars</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleMetals.map((label) => {
            const v = pick(label)!
            return (
              <TableRow key={label} className="hover:bg-transparent">
                <TableCell className="text-left">{label}</TableCell>
                <TableCell className="text-center">{v.content.toFixed(2)} toz</TableCell>
                <TableCell className="text-center">{v.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-right">
                  <PriceNumberFlow value={v.profit} />
                </TableCell>
              </TableRow>
            )
          })}

          {/* Shipping fee row (only for Total + Dorado/Customer) */}
          {showFeeRow && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left text-neutral-800">Shipping Fee</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={-fee} />
              </TableCell>
            </TableRow>
          )}

          {/* Net row to make the math obvious */}
          {showFeeRow && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left font-medium text-neutral-900">Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right font-medium text-neutral-900">
                <PriceNumberFlow value={sumPartyNet(bucket, party)} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    )
  }

  const renderBucket = (bucket: Bucket) => (
    <div className="flex flex-col gap-2">
      <AccordionItem
        label="Dorado"
        value={bucket === 'total' ? sumPartyNet(bucket, 'dorado') : sumPartyGross(bucket, 'dorado')}
        open={isOpen(bucket, 'dorado')}
        onToggle={() => toggle(bucket, 'dorado')}
      >
        {renderTableBody('dorado', bucket)}
      </AccordionItem>

      <AccordionItem
        label="Customer"
        value={bucket === 'total' ? sumPartyNet(bucket, 'customer') : sumPartyGross(bucket, 'customer')}
        open={isOpen(bucket, 'customer')}
        onToggle={() => toggle(bucket, 'customer')}
      >
        {renderTableBody('customer', bucket)}
      </AccordionItem>

      <AccordionItem
        label="Refiner"
        value={sumPartyGross(bucket, 'refiner')}
        open={isOpen(bucket, 'refiner')}
        onToggle={() => toggle(bucket, 'refiner')}
      >
        {renderTableBody('refiner', bucket)}
      </AccordionItem>
    </div>
  )

  if (availableBuckets.length === 0) {
    return (
      <div className="flex w-full h-full bg-card raised-off-page p-4 rounded-md">
        <div className="text-neutral-600">No items to display.</div>
      </div>
    )
  }

  return (
    <div className="flex w-full h-full bg-card raised-off-page p-4 rounded-md">
      <div className="flex flex-col gap-4 w-full">
        <div className="text-xl text-neutral-900">Content and Profit Breakdown</div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Bucket)} className="w-full">
          <TabsList className="w-full justify-start gap-2 bg-transparent px-0">
            {availableBuckets.includes('total') && (
              <TabsTrigger
                value="total"
                className={cn(
                  config.background_color,
                  'data-[state=active]:text-white data-[state=inactive]:bg-neutral-200 data-[state=inactive]:text-neutral-900 raised-off-page cursor-pointer py-2'
                )}
              >
                Total
              </TabsTrigger>
            )}
            {availableBuckets.includes('scrap') && (
              <TabsTrigger
                value="scrap"
                className={cn(
                  config.background_color,
                  'data-[state=active]:text-white data-[state=inactive]:bg-neutral-200 data-[state=inactive]:text-neutral-900 raised-off-page cursor-pointer py-2'
                )}
              >
                Scrap
              </TabsTrigger>
            )}
            {availableBuckets.includes('bullion') && (
              <TabsTrigger
                value="bullion"
                className={cn(
                  config.background_color,
                  'data-[state=active]:text-white data-[state=inactive]:bg-neutral-200 data-[state=inactive]:text-neutral-900 raised-off-page cursor-pointer py-2'
                )}
              >
                Bullion
              </TabsTrigger>
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
