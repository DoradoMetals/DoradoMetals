'use client'

import { useEffect, useState, useMemo } from 'react'
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

  const metalsFor = (party: Party, bucket: Bucket) => totals[party][bucket]

  const bucketHasAnyContent = (b: Bucket) => {
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
      <Table className="font-normal text-neutral-700 overflow-hidden">
        <TableHeader className="text-sm text-neutral-800 hover:bg-transparent">
          <TableRow className="hover:bg-transparent">
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
              <TableRow key={label} className="hover:bg-transparent">
                <TableCell className="text-left">{bucket === 'total' ? `${label} Net` : label}</TableCell>
                <TableCell className="text-center">{v.content.toFixed(3)} toz</TableCell>
                <TableCell className="text-center">{v.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-right">
                  <PriceNumberFlow value={v.profit} />
                </TableCell>
              </TableRow>
            )
          })}

          {showShipping && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left text-neutral-800">Shipping Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals[party].shipping_net} />
              </TableCell>
            </TableRow>
          )}

          {showFee && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left text-neutral-800">Refiner Fee</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals[party].refiner_fee_net} />
              </TableCell>
            </TableRow>
          )}

          {showSpotNet && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left text-neutral-800">Spot Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={totals.dorado.spot_net} />
              </TableCell>
            </TableRow>
          )}

          {showNetRow && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-left font-medium text-neutral-900">Total Net</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-center">—</TableCell>
              <TableCell className="text-right font-medium text-neutral-900">
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
      <AccordionItem
        label="Dorado"
        value={accordionValue('dorado', bucket)}
        open={isOpen(bucket, 'dorado')}
        onToggle={() => toggle(bucket, 'dorado')}
      >
        {renderTableBody('dorado', bucket)}
      </AccordionItem>

      <AccordionItem
        label="Customer"
        value={accordionValue('customer', bucket)}
        open={isOpen(bucket, 'customer')}
        onToggle={() => toggle(bucket, 'customer')}
      >
        {renderTableBody('customer', bucket)}
      </AccordionItem>

      <AccordionItem
        label="Refiner"
        value={accordionValue('refiner', bucket)}
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
    <div className="flex w-full bg-card raised-off-page p-4 rounded-md">
      <div className="flex flex-col gap-4 w-full">
        <div className="text-xl text-neutral-900">Profit Breakdown</div>

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
