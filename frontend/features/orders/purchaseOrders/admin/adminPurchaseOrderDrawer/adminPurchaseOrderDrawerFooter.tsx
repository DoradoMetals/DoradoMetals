'use client'
import { Accordion, Amount, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dorado/components'

import { useMemo, useState } from 'react'
import { PurchaseOrderDrawerFooterProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { assignScrapItemNames } from '@/features/orders/display'
import { DetailRow } from '@/shared/ui/DetailRow'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { PurchaseOrderActionButtons } from './adminPurchaseOrderDrawerContents/adminPurchaseOrderActionButtons'
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import { usePaymentMethods, useOrderShipments } from '@dorado/client'
import { outboundOf, returnOf } from '@/features/shipping/queries'
import { useProducts } from '@/features/products/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { formatRate } from '@/features/rates/types'
// Every dollar figure below comes from the order quote - the server prices
// the order's own items at its own spots, honouring a lock (Jacob's
// no-previews ruling). The client keeps only weight/rate display math.
import { useOrderQuote } from '@/features/quotes/queries'
import { nameOf } from '@/features/orders/display'

export default function AdminPurchaseOrderDrawerFooter({ view }: PurchaseOrderDrawerFooterProps) {
  const { order } = view

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
  const { items } = view
  const address = view.address
  const { data: catalogue = [] } = useProducts()
  const { data: spotPrices = [] } = useSpotPrices()

  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const returnShipment = returnOf(shipments)
  const shipmentService = shipment?.service?.name
  const returnService = returnShipment?.service?.name
  const payout = view.payout

  // bullion_id IS the discriminator - null means scrap; `item_type` was
  // derived in the compose layer and has no column.
  const scrapItems = assignScrapItemNames(
    items.filter((item) => item.bullion_id === null),
    (metal_id: string) => nameOf(spotPrices, metal_id)
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
                      <TableCell className="text-right">{item.content?.toFixed(3)}</TableCell>
                      {/* One premium, read once: 085 folded scrap into the
                          items table, and the composed wire's
                          scrap.bid_premium was served FROM item.premium. */}
                      <TableCell className="text-center">{formatRate(item.premium)}</TableCell>
                      {/* THE PAYABLE OUNCES ARE THE SERVER'S (rules.payableOf).
                          This cell multiplied a content by a premium itself. */}
                      <TableCell className="text-right">
                        {(item.payable ?? 0).toFixed(3)}{' '}
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
                      <TableCell>{nameOf(catalogue, item.bullion_id)}</TableCell>
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
                <DetailRow label="Scrap:">
                  <Amount value={scrapTotal} />
                </DetailRow>
              )}

              {bullionItems.length > 0 && (
                <DetailRow label="Bullion:">
                  <Amount value={bullionTotal} />
                </DetailRow>
              )}

              {(shipment?.shipment.cost ?? 0) > 0 && (
                <DetailRow label="Shipping:">
                  -<Amount value={shipment?.shipment.cost ?? 0} />
                </DetailRow>
              )}

              {payoutFee > 0 && (
                <DetailRow label="Payout Fee:">
                  -<Amount value={payoutFee} />
                </DetailRow>
              )}

              <DetailRow label="Total:" variant="total">
                <Amount value={total} />
              </DetailRow>
            </div>
          </Accordion>
        </div>
      )}

      <PurchaseOrderActionButtons view={view} />
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
