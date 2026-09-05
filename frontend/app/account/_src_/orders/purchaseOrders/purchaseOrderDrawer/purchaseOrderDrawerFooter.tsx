'use client'
import { Accordion, Amount, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dorado/components'

import { useMemo, useState } from 'react'
import { PurchaseOrderDrawerFooterProps, statusConfig } from '@/shared/types/purchaseOrders'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { payoutMethodIcon, PayoutMethodType } from '@/shared/types/payouts'
import { usePaymentMethods } from '@dorado/client'
import { formatRate } from '@/shared/types/rates'
import { outboundOf, returnOf, useOrderShipments } from '@dorado/client'
import { useProducts } from '@/shared/hooks/products/queries'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
// Every dollar figure below comes from the order quote - the server prices
// the order's own items at its own spots (Jacob's no-previews ruling). The
// client keeps only weight/rate display math.
import { useOrderPricing } from '@/shared/hooks/quotes/queries'

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
  // names for one table that carries the column. The COMPOSED read, not
  // `view.shipments`: the service's NAME is what this table prints, and
  // resolving it off a cached carrier-services list was a join the browser was
  // doing. The drawer's other panels read the same key, so it costs no request.
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const shipmentService = shipment?.service?.name
  const returnService = returnShipment?.service?.name
  const payout = view.payout

  const { data: quote } = useOrderPricing(order.id)
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
  const scrapItems = items.filter((item) => item.bullion_id === null)
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
          trailing={<Amount value={scrapTotal} />}
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
                  <TableCell className="text-left">{item.item_name}</TableCell>
                  <TableCell className="text-center">{item.content?.toFixed(3)} toz</TableCell>
                  {/* THE SCRAP LINE'S PREMIUM IS ITS OWN. The composed wire
                      served scrap.bid_premium FROM item.premium - 085 dropped
                      the separate column when scrap folded into the items
                      table - so `item.premium ?? item.scrap?.bid_premium` was
                      one value read twice. */}
                  <TableCell className="text-center">{formatRate(item.premium)}</TableCell>
                  <TableCell className="text-center">
                    {(item.payable ?? 0).toFixed(3)} toz
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Scrap line_total is the whole line - content is not
                        multiplied by quantity - and honours a stored price. */}
                    <Amount value={quoteLineById.get(item.id)?.line_total ?? 0} />
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
          trailing={<Amount value={bullionTotal} />}
        >
          <Table className="overflow-hidden">
            <TableBody>
              {bullionItems.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right p-0">
                    {/* line_total is already unit_price * quantity. */}
                    <Amount value={quoteLineById.get(item.id)?.line_total ?? 0} />
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
              -<Amount value={shipment.shipment.cost ?? 0} />
            </>
          }
        >
          <Table className="overflow-hidden">
            <TableBody>
              <TableRow>
                <TableCell>{shipmentService}</TableCell>
                <TableCell>{shipment.shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                <TableCell className="text-right p-0">
                  -<Amount value={shipment.shipment.cost ?? 0} />
                </TableCell>
              </TableRow>
              {order.status === 'Cancelled' && returnShipment && (
                <TableRow>
                  <TableCell>{returnService} (Return)</TableCell>
                  <TableCell>{returnShipment.shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                  <TableCell className="text-right p-0">
                    -<Amount value={returnShipment.shipment.cost ?? 0} />
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
              -<Amount value={payoutFee} />
            </>
          }
        >
          <Table className="overflow-hidden">
            <TableBody>
              <TableRow>
                <TableCell>{payoutMethod?.label ?? 'Unknown Method'}</TableCell>
                <TableCell className="text-right p-0">
                  -<Amount value={payoutFee} />
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
        trailing={<Amount value={total} />}
      >
        <div className="flex flex-col gap-2">
          {scrapItems.length > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Scrap:</p>
              <strong>
                <Amount value={scrapTotal} />
              </strong>
            </div>
          )}

          {bullionItems.length > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Bullion:</p>
              <strong>
                <Amount value={bullionTotal} />
              </strong>
            </div>
          )}

          {(shipment?.shipment.cost ?? 0) > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Shipping:</p>
              <strong>
                -<Amount value={shipment?.shipment.cost ?? 0} />
              </strong>
            </div>
          )}

          {payoutFee > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Payout Fee:</p>
              <strong>
                -<Amount value={payoutFee} />
              </strong>
            </div>
          )}

          <div className="flex w-full items-center justify-between gap-2">
            <strong>Total:</strong>
            <strong className="stat-sm">
              <Amount value={total} />
            </strong>
          </div>
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
