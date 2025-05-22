import { Button } from '@/components/ui/button'

import {
  useAcceptOffer,
  useCancelOrder,
  usePurchaseOrderMetals,
  useUpdateOfferNotes,
} from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'

import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { useMemo, useState } from 'react'
import { payoutOptions } from '@/types/payout'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import CountdownRing from '@/components/ui/countdown-ring'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default function RejectedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const acceptOffer = useAcceptOffer()
  const cancelOrder = useCancelOrder()
  const updateOfferNotes = useUpdateOfferNotes()

  const [offerNotes, setOfferNotes] = useState(order.offer_notes ?? '')
  const [open, setOpen] = useState(false)

  const config = statusConfig[order.purchase_order_status]

  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const handleAcceptOffer = () => {
    acceptOffer.mutate({
      purchase_order: order,
      order_spots: orderSpotPrices,
      spot_prices: spotPrices,
    })
  }

  const handleUpdateOrderNotes = (offer_notes: string) => {
    updateOfferNotes.mutate({ purchase_order: order, offer_notes: offer_notes })
  }

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices, payoutFee)
  }, [order, spotPrices, orderSpotPrices, payoutFee])

  return (
    <>
      <div className="flex flex-col w-full h-full">
        {order.offer_status === 'Rejected' ? (
          <div className="flex w-full mb-4">
            <div className="flex flex-col">
              <div className="flex w-full justify-between items-center mb-4">
                <div className="text-xl text neutral-800">Original Offer:</div>
                <div className="text-xl text neutral-800">
                  <PriceNumberFlow value={order.total_price ?? total} />
                </div>
              </div>
              <div className="text-sm text-neutral-600 text-left mb-4">
                We will be in touch as soon as possible to see if we can find a price that better
                fits your expectations. If we choose to update your offer, you will see the new
                offer here. In the meantime, please consider leaving us a note as to why you
                rejected the initial offer if you have not already done so.
              </div>
              <div className="flex flex-col gap-0 w-full">
                <Textarea
                  className="input-floating-label-form min-h-30"
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value)}
                />
                <Button
                  variant="link"
                  className={cn(config.text_color, 'p-0 ml-auto')}
                  onClick={() => {
                    handleUpdateOrderNotes(offerNotes)
                  }}
                  disabled={updateOfferNotes.isPending}
                >
                  {updateOfferNotes.isPending ? 'Loading...' : 'Update Offer Notes'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full w-full gap-3 mb-4">
            <div className="flex w-full justify-between items-center">
              <div className="text-xl text neutral-800">Negotiated Offer:</div>
              <div className="text-xl text neutral-800">
                <PriceNumberFlow value={order.total_price ?? total} />
              </div>
            </div>
            {order.spots_locked ? (
              <p className="text-sm text-neutral-700 text-left">
                We have updated your offer. Spot prices have been locked for your order. You will
                have 24 hours to accept or reject the new offer, after which we will unlock the
                current spot prices.
              </p>
            ) : (
              <p className="text-sm text-neutral-700 text-left">
                We have updated your offer. Spot prices have not been locked for your order. You
                will have 1 week to accept or reject the new offer, after which it will
                automatically be accepted on your behalf.
              </p>
            )}
            <div className="flex h-full w-full items-center justify-center">
              <CountdownRing
                sentAt={order.offer_sent_at!}
                expiresAt={order.offer_expires_at!}
                fillColor={config.stroke_color}
              />
            </div>
          </div>
        )}
        <div className="flex flex-col items-center w-full gap-2 mt-auto">
          <Button
            variant="default"
            className={cn(
              config.background_color,
              config.hover_background_color,
              'text-white raised-off-page w-full p-4'
            )}
            onClick={handleAcceptOffer}
            disabled={acceptOffer.isPending}
          >
            {acceptOffer.isPending
              ? 'Accepting…'
              : order.offer_status === 'Rejected'
              ? 'Accept Original Offer'
              : 'Accept Negotiated Offer'}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                className={cn(
                  config.text_color,
                  config.hover_background_color,
                  'hover:text-white raised-off-page w-full p-4 bg-card'
                )}
              >
                Cancel Order
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background">
              <DialogHeader>
                <DialogTitle className="text-left">Cancel Order?</DialogTitle>
              </DialogHeader>
              <DialogDescription>
                We’re sorry we could not meet your price expectations. We will get your items ready
                for return. Please note, shipping charges may still apply. We will be in touch soon
                to coordinate the return shipment.
              </DialogDescription>

              <DialogFooter>
                <Button
                  variant="default"
                  className={cn(
                    config.background_color,
                    config.hover_background_color,
                    'text-white raised-off-page w-full p-4'
                  )}
                  onClick={() => {
                    cancelOrder.mutate({ purchase_order: order })
                  }}
                  disabled={cancelOrder.isPending}
                >
                  {cancelOrder.isPending ? 'Cancelling...' : 'Cancel Order'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  )
}
