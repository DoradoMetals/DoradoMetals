'use client'
import { Accordion } from '@dorado/components'

import { useMemo, useState } from 'react'
import { PurchaseOrderDrawerFooterProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { assignScrapItemNames } from '@/features/orders/display'
import { DetailRow } from '@/shared/ui/DetailRow'

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
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import { usePaymentMethods } from '@dorado/client'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { useShipmentDisplay, outboundOf, returnOf } from '@/features/shipping/queries'
import { useProducts } from '@/features/products/queries'
import { useSpotPrices } from '@/features/spots/queries'
// Every dollar figure below comes from the order quote - the server prices
// the order's own items at its own spots (Jacob's no-previews ruling). The
// client keeps only weight/rate display math.
import { useOrderQuote } from '@/features/quotes/queries'
import { nameOf } from '@/features/orders/display'

// A CONTAINER (ruling 14): it holds the order id and calls each read itself,
// one hop from what it renders. The composed order that used to carry all of
// this - order_items, shipment, return_shipment, payout - is gone; each is
// its own hook keyed by the id this component already has.
export default function PurchaseOrderDrawerFooter({ view }: PurchaseOrderDrawerFooterProps) {
  const { order } = view

  const valueLabel = statusConfig[order.status ?? '']?.value_label ?? ''

  const { items } = view
  const { data: catalogue = [] } = useProducts()
  // The spots reference list: its `id` IS the metal's id, which is how a
  // scrap line's metal_id becomes "Gold".
  const { data: spotPrices = [] } = useSpotPrices()

  // ONE ARRAY, FILTERED ON `direction` - shipment / return_shipment were two
  // names for one table that carries the column.
  const shipment = outboundOf(view.shipments)
  const returnShipment = returnOf(view.shipments)
  const { service_name: shipmentService } = useShipmentDisplay(shipment)
  const { service_name: returnService } = useShipmentDisplay(returnShipment)
  const payout = view.payout

  const { data: quote } = useOrderQuote(order.id)
  // Quote lines pair to order items BY ID - these are stored rows, unlike the
  // purchase basket quote's index pairing.
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
    (metal_id: string) => nameOf(spotPrices, metal_id)
  )
  const bullionItems = items.filter((item) => item.bullion_id !== null)
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const payoutMethod = payoutMethods.find((p) => p.type === payout?.method)
  const payoutFee = Number(payoutMethod?.flat_fee ?? 0)

  // 0 until the first quote lands, which is what the old client math showed
  // before the spot feed loaded; placeholderData keeps later ticks flicker-free.
  const total = quote?.total ?? 0
  const scrapTotal = quote?.scrap_total ?? 0
  const bullionTotal = quote?.bullion_total ?? 0

  return (
    <div className="flex flex-col w-full gap-2">
      {scrapItems.length > 0 && (
        <Accordion
          surface="bare"
          label={`Scrap ${valueLabel}`}
          open={open.scrap}
          onToggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          trailing={<PriceNumberFlow value={scrapTotal} />}
        >
          <Table className="overflow-hidden">
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Line Item</TableHead>
                <TableHead className="text-center">Content</TableHead>
                <TableHead className="text-center">Rate</TableHead>
                <TableHead className="text-center">Payable</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scrapItems.map((item, i) => (
                <TableRow key={i}>
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
          surface="bare"
          label={`Bullion ${valueLabel}`}
          open={open.bullion}
          onToggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          trailing={<PriceNumberFlow value={bullionTotal} />}
        >
          <Table className="overflow-hidden">
            <TableBody>
              {bullionItems.map((item, i) => (
                <TableRow key={i}>
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
          surface="bare"
          label="Shipping Charges"
          open={open.shipment ?? false}
          onToggle={() => setOpen((prev) => ({ ...prev, shipment: !prev.shipment }))}
          trailing={
            <>
              -<PriceNumberFlow value={shipment.cost ?? 0} />
            </>
          }
        >
          <Table className="overflow-hidden">
            <TableBody>
              <TableRow>
                <TableCell>{shipmentService}</TableCell>
                <TableCell>{shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                <TableCell className="text-right p-0">
                  -<PriceNumberFlow value={shipment.cost ?? 0} />
                </TableCell>
              </TableRow>
              {order.status === 'Cancelled' && returnShipment && (
                <TableRow>
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
          surface="bare"
          label="Payout Fee"
          open={open.payout ?? false}
          onToggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          trailing={
            <>
              -<PriceNumberFlow value={payoutFee} />
            </>
          }
        >
          <Table className="overflow-hidden">
            <TableBody>
              <TableRow>
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
        surface="bare"
        label={`Total ${valueLabel}`}
        open={open.total}
        onToggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        trailing={<PriceNumberFlow value={total} />}
      >
        <div className="flex flex-col gap-2">
          {scrapItems.length > 0 && (
            <DetailRow label="Scrap:">
              <PriceNumberFlow value={scrapTotal} />
            </DetailRow>
          )}

          {bullionItems.length > 0 && (
            <DetailRow label="Bullion:">
              <PriceNumberFlow value={bullionTotal} />
            </DetailRow>
          )}

          {(shipment?.cost ?? 0) > 0 && (
            <DetailRow label="Shipping:">
              -<PriceNumberFlow value={shipment?.cost ?? 0} />
            </DetailRow>
          )}

          {payoutFee > 0 && (
            <DetailRow label="Payout Fee:">
              -<PriceNumberFlow value={payoutFee} />
            </DetailRow>
          )}

          <DetailRow label="Total:" variant="total">
            <PriceNumberFlow value={total} />
          </DetailRow>
        </div>
      </Accordion>

      <div className="flex w-full justify-between items-center mt-3">
        <p>Questions? Give us a call.</p>
        <a href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
          {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
        </a>
      </div>
    </div>
  )
}
