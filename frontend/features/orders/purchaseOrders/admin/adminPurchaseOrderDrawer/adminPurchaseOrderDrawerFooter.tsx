'use client'

import { useMemo, useState } from 'react'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerFooterProps,
  statusConfig,
} from '@/features/orders/purchaseOrders/types'
import AccordionSection from '@/shared/ui/AccordionSection'
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
import { PurchaseOrderActionButtons } from './adminPurchaseOrderDrawerContents/adminPurchaseOrderActionButtons'
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import { usePaymentMethods } from '@/features/payments/queries'
import { useOrderPayouts } from '@/features/payouts/queries'
import { useOrderItems, useOrderAddress, nameOf } from '@/features/orders/reads'
import {
  useOrderShipments,
  useShipmentDisplay,
  outboundOf,
  returnOf,
} from '@/features/shipping/queries'
import { useProducts } from '@/features/products/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { formatRate } from '@/features/rates/utils/resolveRate'
// Every dollar figure below comes from the order quote - the server prices
// the order's own items at its own spots, honouring a lock (Jacob's
// no-previews ruling). The client keeps only weight/rate display math.
import { useOrderQuote } from '@/features/quotes/queries'

export default function AdminPurchaseOrderDrawerFooter({ order }: PurchaseOrderDrawerFooterProps) {
  const valueLabel = statusConfig[order.status ?? '']?.value_label ?? ''

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
  // A CONTAINER (ruling 14): every piece the composed order used to carry -
  // lines, parcels, the payout, the address - is its own read keyed by the id
  // this component already holds.
  const { data: items = [] } = useOrderItems(order.id)
  const { data: shipments = [] } = useOrderShipments(order.id)
  const { data: payouts = [] } = useOrderPayouts(order.id)
  const { data: address } = useOrderAddress(order.id)
  const { data: catalogue = [] } = useProducts()
  const { data: spotPrices = [] } = useSpotPrices()

  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const { service_name: shipmentService } = useShipmentDisplay(shipment)
  const { service_name: returnService } = useShipmentDisplay(returnShipment)
  const payout = payouts[0] ?? null

  // bullion_id IS the discriminator - null means scrap; `item_type` was
  // derived in the compose layer and has no column.
  const scrapItems = assignScrapItemNames(
    items.filter((item) => item.bullion_id === null),
    (metal_id) => nameOf(spotPrices, metal_id)
  )
  const bullionItems = items.filter((item) => item.bullion_id !== null)
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')
  const payoutMethod = payoutMethods.find((p) => p.type === payout?.method)
  const payoutFee = payout?.cost ?? 0

  // 0 until the first quote lands, which is what the old client math showed
  // before the spot feed loaded; placeholderData keeps later ticks flicker-free.
  const total = quote?.total ?? 0
  const scrapTotal = quote?.scrap_total ?? 0
  const bullionTotal = quote?.bullion_total ?? 0

  return (
    <div className="flex flex-col w-full gap-2">
      {order.status !== 'Completed' && order.status !== 'Payment Processing' && (
        <div className='flex flex-col w-full gap-2'>
          {scrapItems.length > 0 && (
            <AccordionSection
              label={`Scrap ${valueLabel}`}
              open={open.scrap}
              onToggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
              total={scrapTotal}
            >
              <Table className="overflow-hidden">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Line Item</TableHead>
                    <TableHead className="text-center">Content (toz)</TableHead>
                    <TableHead className="text-center">Rate</TableHead>
                    <TableHead className="text-center">Payable (toz)</TableHead>
                    <TableHead className="text-right">Estimate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-left">{item.name}</TableCell>
                      <TableCell className="text-right">
                        {item.content?.toFixed(3)}
                      </TableCell>
                      {/* One premium, read once: 085 folded scrap into the
                          items table, and the composed wire's
                          scrap.bid_premium was served FROM item.premium. */}
                      <TableCell className="text-center">{formatRate(item.premium)}</TableCell>
                      <TableCell className="text-right">
                        {((item.content ?? 0) * (item.premium ?? 0)).toFixed(3)}{' '}
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
            </AccordionSection>
          )}

          {bullionItems.length > 0 && (
            <AccordionSection
              label={`Bullion ${valueLabel}`}
              open={open.bullion}
              onToggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
              total={bullionTotal}
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
            </AccordionSection>
          )}

          {shipment && (
            <AccordionSection
              label="Shipping Charges"
              negative
              open={open.shipment ?? false}
              onToggle={() => setOpen((prev) => ({ ...prev, shipment: !prev.shipment }))}
              total={shipment.cost ?? 0}
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
                      <TableCell>
                        {returnShipment.insured ? 'Insured' : 'Uninsured'}
                      </TableCell>
                      <TableCell className="text-right p-0">
                        -<PriceNumberFlow value={returnShipment.cost ?? 0} />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AccordionSection>
          )}

          {payoutFee > 0 && (
            <AccordionSection
              label="Payout Fee"
              negative
              open={open.payout ?? false}
              onToggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
              total={payoutFee}
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
            </AccordionSection>
          )}

          <AccordionSection
            label={`Total ${valueLabel}`}
            open={open.total}
            onToggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
            total={total}
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
          </AccordionSection>
        </div>
      )}

      <PurchaseOrderActionButtons order={order} />
      <div className="flex w-full justify-between items-center mt-3">
        <p>Call Customer:</p>

        {address?.phone_number ? (
          <a href={`tel:+1${address.phone_number}`}>
            {formatPhoneNumber(address.phone_number ?? '')}
          </a>
        ) : (
          <p>No Phone Number</p>
        )}
      </div>
    </div>
  )
}
