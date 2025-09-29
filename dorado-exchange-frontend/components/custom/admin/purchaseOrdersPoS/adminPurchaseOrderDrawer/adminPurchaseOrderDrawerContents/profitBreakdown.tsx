'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { usePurchaseOrderRefinerMetals } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { computePurchaseOrderTotals } from '@/utils/calculatePurchaseOrderTotals'
import { PurchaseOrder } from '@/types/purchase-order'

type Party  = 'customer' | 'refiner' | 'dorado'
type Bucket = 'scrap' | 'bullion' | 'total'

function Accordion({
  label,
  value,
  children,
  defaultOpen = false,
}: {
  label: string
  value: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md bg-card raised-off-page">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer"
      >
        <span>{label}</span>
        <div className="flex items-center gap-2 text-base">
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
            className="overflow-hidden will-change-transform"
          >
            <div className="p-2 pr-9">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ProfitBreakdown({ order }: { order: PurchaseOrder }) {
  const { data: orderSpotPrices = [] }   = usePurchaseOrderMetals(order.id)
  const { data: refinerSpotPrices = [] } = usePurchaseOrderRefinerMetals(order.id)

  const totals = computePurchaseOrderTotals(order, orderSpotPrices, refinerSpotPrices)

  const [tab, setTab] = useState<Party>('dorado')

  const sumBucket = (party: Party, bucket: Bucket) => {
    const d = totals[party][bucket]
    return (d.gold.profit ?? 0)
         + (d.silver.profit ?? 0)
         + (d.platinum.profit ?? 0)
         + (d.palladium.profit ?? 0)
  }

  const renderTableBody = (party: Party, bucket: Bucket) => {
    const data = totals[party][bucket]
    const rows = [
      ['Gold', data.gold],
      ['Silver', data.silver],
      ['Platinum', data.platinum],
      ['Palladium', data.palladium],
    ] as const

    return (
      <Table className="font-normal text-neutral-700 overflow-hidden">
        <TableHeader className="text-xs text-neutral-700 hover:bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-left">Metal</TableHead>
            <TableHead className="text-center">Content (toz)</TableHead>
            <TableHead className="text-center">Percentage (%)</TableHead>
            <TableHead className="text-right">Dollars</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, v]) => (
            <TableRow key={label} className="hover:bg-transparent">
              <TableCell className="text-left">{label}</TableCell>
              <TableCell className="text-center">{v.content.toFixed(4)}</TableCell>
              <TableCell className="text-center">{v.percentage.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                <PriceNumberFlow value={v.profit} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  const renderParty = (party: Party) => (
    <div className="space-y-3">
      <Accordion label="Scrap" value={sumBucket(party, 'scrap')}>
        {renderTableBody(party, 'scrap')}
      </Accordion>

      <Accordion label="Bullion" value={sumBucket(party, 'bullion')}>
        {renderTableBody(party, 'bullion')}
      </Accordion>

      <Accordion label="Total" value={sumBucket(party, 'total')}>
        {renderTableBody(party, 'total')}
      </Accordion>
    </div>
  )

  return (
    <div className="flex w-full">
      <div className="flex flex-col gap-4 w-full">
        <div className="text-xl text-neutral-900">Content and Profit Breakdown</div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Party)} className="w-full">
          <TabsList className="w-full justify-start gap-2 bg-transparent px-0">
            <TabsTrigger value="customer" className="tab-indicator-primary">Customer</TabsTrigger>
            <TabsTrigger value="refiner"  className="tab-indicator-primary">Refiner</TabsTrigger>
            <TabsTrigger value="dorado"   className="tab-indicator-primary">Dorado</TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[11px]" />

          <TabsContent value="customer">{renderParty('customer')}</TabsContent>
          <TabsContent value="refiner">{renderParty('refiner')}</TabsContent>
          <TabsContent value="dorado">{renderParty('dorado')}</TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
