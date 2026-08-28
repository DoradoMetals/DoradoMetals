'use client'

import { useMemo, useState } from 'react'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerFooterProps,
  statusConfig,
} from '@/features/orders/purchaseOrders/types'
import { cn } from '@/shared/utils/cn'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { payoutOptions } from '@/features/payouts/types'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { useOrderItems, nameOf } from '@/features/orders/reads'
import { useOrderPayouts } from '@/features/payouts/queries'
import {
  useOrderShipments,
  useShipmentDisplay,
  outboundOf,
  returnOf,
} from '@/features/shipping/queries'
import { useProducts } from '@/features/products/queries'
import { useSpotPrices } from '@/features/spots/queries'
// Every dollar figure below comes from the order quote - the server prices
// the order's own items at its own spots (Jacob's no-previews ruling). The
// client keeps only weight/rate display math.
import { useOrderQuote } from '@/features/quotes/queries'

// A CONTAINER (ruling 14): it holds the order id and calls each read itself,
// one hop from what it renders. The composed order that used to carry all of
// this - order_items, shipment, return_shipment, payout - is gone; each is
// its own hook keyed by the id this component already has.
export default function PurchaseOrderDrawerFooter({ order }: PurchaseOrderDrawerFooterProps) {
  const valueLabel = statusConfig[order.status ?? '']?.value_label ?? ''

  const { data: items = [] } = useOrderItems(order.id)
  const { data: shipments = [] } = useOrderShipments(order.id)
  const { data: payouts = [] } = useOrderPayouts(order.id)
  const { data: catalogue = [] } = useProducts()
  // The spots reference list: its `id` IS the metal's id, which is how a
  // scrap line's metal_id becomes "Gold".
  const { data: spotPrices = [] } = useSpotPrices()

  // ONE ARRAY, FILTERED ON `direction` - shipment / return_shipment were two
  // names for one table that carries the column.
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const { service_name: shipmentService } = useShipmentDisplay(shipment)
  const { service_name: returnService } = useShipmentDisplay(returnShipment)
  const payout = payouts[0] ?? null

  const { data: quote } = useOrderQuote(order.id)
  // Quote lines pair to order items BY ID - these are stored rows, unlike the
  // sell-cart quote's index pairing.
  const quoteLineById = useMemo(
    () => new Map((quote?.items ?? []).map((line) => [line.id, line])),
    [quote]
  )

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    shipment: false,
    payout: false,
    total: false,
  })
  // bullion_id IS the discriminator now - null means scrap. `item_type` was
  // derived in the compose layer and has no column.
  const scrapItems = assignScrapItemNames(
    items.filter((item) => item.bullion_id === null),
    (metal_id) => nameOf(spotPrices, metal_id)
  )
  const bullionItems = items.filter((item) => item.bullion_id !== null)
  const payoutMethod = payoutOptions.find((p) => p.method === payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  // 0 until the first quote lands, which is what the old client math showed
  // before the spot feed loaded; placeholderData keeps later ticks flicker-free.
  const total = quote?.total ?? 0
  const scrapTotal = quote?.scrap_total ?? 0
  const bullionTotal = quote?.bullion_total ?? 0

  return (
    <div className="flex flex-col w-full gap-2">
      {scrapItems.length > 0 && (
        <Accordion
          label={`Scrap ${valueLabel}`}
          open={open.scrap}
          toggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          total={scrapTotal}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableHeader className="text-xs text-neutral-700 hover:bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left">Line Item</TableHead>
                <TableHead className="text-center">Content</TableHead>
                <TableHead className="text-center">Rate</TableHead>
                <TableHead className="text-center">Payable</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scrapItems.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="text-left">{item.name}</TableCell>
                  <TableCell className="text-center">{item.content?.toFixed(3)} toz</TableCell>
                  {/* THE SCRAP LINE'S PREMIUM IS ITS OWN. The composed wire
                      served scrap.bid_premium FROM item.premium - 085 dropped
                      the separate column when scrap folded into the items
                      table - so `item.premium ?? item.scrap?.bid_premium` was
                      one value read twice. */}
                  <TableCell className="text-center">{formatRate(item.premium)}</TableCell>
                  <TableCell className="text-center">
                    {((item.content ?? 0) * (item.premium ?? 1)).toFixed(3)} toz
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Scrap line_total is the whole line - content is not
                        multiplied by quantity - and honours a stored price. */}
                    <PriceNumberFlow value={quoteLineById.get(item.id)?.line_total ?? 0} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {bullionItems.length > 0 && (
        <Accordion
          label={`Bullion ${valueLabel}`}
          open={open.bullion}
          toggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          total={bullionTotal}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              {bullionItems.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{nameOf(catalogue, item.bullion_id)}</TableCell>
                  <TableCell className="text-right p-0">
                    {/* line_total is already unit_price * quantity. */}
                    <PriceNumberFlow value={quoteLineById.get(item.id)?.line_total ?? 0} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {shipment && (
        <Accordion
          label="Shipping Charges"
          open={open.shipment ?? false}
          toggle={() => setOpen((prev) => ({ ...prev, shipment: !prev.shipment }))}
          total={shipment.cost ?? 0}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell>{shipmentService}</TableCell>
                <TableCell>{shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                <TableCell className="text-right p-0">
                  -<PriceNumberFlow value={shipment.cost ?? 0} />
                </TableCell>
              </TableRow>
              {order.status === 'Cancelled' && returnShipment && (
                <TableRow className="hover:bg-transparent">
                  <TableCell>{returnService} (Return)</TableCell>
                  <TableCell>{returnShipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                  <TableCell className="text-right p-0">
                    -<PriceNumberFlow value={returnShipment.cost ?? 0} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {payoutFee > 0 && (
        <Accordion
          label="Payout Fee"
          open={open.payout ?? false}
          toggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          total={payoutFee}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell>{payoutMethod?.label ?? 'Unknown Method'}</TableCell>
                <TableCell className="text-right p-0">
                  -<PriceNumberFlow value={payoutFee} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Accordion>
      )}

      <Accordion
        label={`Total ${valueLabel}`}
        open={open.total}
        toggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        total={total}
      >
        <div className="grid grid-cols-2 gap-2 text-sm text-neutral-700">
          {scrapItems.length > 0 && (
            <>
              <div>Scrap:</div>
              <div className="text-right">
                <PriceNumberFlow value={scrapTotal} />
              </div>
            </>
          )}

          {bullionItems.length > 0 && (
            <>
              <div>Bullion:</div>
              <div className="text-right">
                <PriceNumberFlow value={bullionTotal} />
              </div>
            </>
          )}

          {(shipment?.cost ?? 0) > 0 && (
            <>
              <div>Shipping:</div>
              <div className="text-right">
                -<PriceNumberFlow value={shipment?.cost ?? 0} />
              </div>
            </>
          )}

          {payoutFee > 0 && (
            <>
              <div>Payout Fee:</div>
              <div className="text-right">
                -<PriceNumberFlow value={payoutFee} />
              </div>
            </>
          )}

          <div className="font-medium">Total:</div>
          <div className="font-medium text-right">
            <PriceNumberFlow value={total} />
          </div>
        </div>
      </Accordion>

      <div className="flex w-full justify-between items-center mt-3">
        <div className="text-sm text-neutral-700">Questions? Give us a call.</div>
        <a
          href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
          className={cn('text-sm hover:underline text-primary')}
        >
          {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
        </a>
      </div>
    </div>
  )
}

function Accordion({
  label,
  open,
  toggle,
  children,
  total,
}: {
  label: string
  open: boolean
  toggle: () => void
  children: React.ReactNode
  total: number
}) {
  return (
    <div className="rounded-md on-glass">
      <button
        type="button"
        onClick={toggle}
        className="w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer"
      >
        {label}
        <div className="flex items-center gap-2 text-base">
          {label === 'Shipping Charges' || label === 'Payout Fee' ? (
            <div className="flex items-center gap-0">
              -<PriceNumberFlow value={total} />
            </div>
          ) : (
            <PriceNumberFlow value={total} />
          )}
          <div className="text-base"></div>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform text-neutral-600', open && 'rotate-180')}
            size={20}
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
