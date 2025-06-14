import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { Button } from '@/components/ui/button'
import CountdownRing from '@/components/ui/countdown-ring'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  useAcceptOffer,
  usePurchaseOrderMetals,
  useRejectOffer,
} from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cn } from '@/lib/utils'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import { useMemo, useState } from 'react'

export default function OfferSentPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const [open, setOpen] = useState(false)
  const [rejectedNotes, setRejectedNotes] = useState('')

  const config = statusConfig[order.purchase_order_status]

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const acceptOffer = useAcceptOffer()
  const rejectOffer = useRejectOffer()

  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices, payoutFee)
  }, [order, spotPrices, orderSpotPrices, payoutFee])

  const handleAcceptOffer = () => {
    acceptOffer.mutate({
      purchase_order: order,
      order_spots: orderSpotPrices,
      spot_prices: spotPrices,
    })
  }

  const handleRejectOffer = () => {
    rejectOffer.mutate({ purchase_order: order, offer_notes: rejectedNotes })
  }

  return (
    <div className="flex flex-col h-full w-full items-center">
      <div className="raised-off-page bg-card p-4 rounded-lg mb-4">
        <div className="flex items-center w-full justify-between">
          <div className="text-2xl text-neutral-900">Offered Price:</div>
          <div className="text-2xl text-neutral-900">
            <PriceNumberFlow value={total} />
          </div>
        </div>
        <div className="flex flex-col gap-4 h-full w-full items-center justify-center">
          <CountdownRing
            sentAt={order.offer_sent_at!}
            expiresAt={order.offer_expires_at!}
            fillColor={config.stroke_color}
          />
          {order.spots_locked ? (
            <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-left">
              Spot prices have been locked for your order. You will have 24 hours to accept or
              reject our offer, after which we will unlock the current spot prices.
            </p>
          ) : (
            <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-left">
              Spot prices have not been locked for your order. You will have 1 week to accept or
              reject our offer, after which it will automatically be accepted on your behalf.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <Button
          variant="default"
          className={cn(
            config.background_color,
            config.hover_background_color,
            'text-white raised-off-page w-full p-4'
          )}
          onClick={() => {
            handleAcceptOffer()
          }}
        >
          Accept Offer
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
              Reject Offer
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-background">
            <DialogHeader>
              <DialogTitle>Reject our offer?</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              If our price doesn't match your expectations, feel free to leave us a note as to why.
              We'll reach out shortly to discuss.
            </DialogDescription>
            <Textarea
              className="input-floating-label-form"
              value={rejectedNotes}
              onChange={(e) => setRejectedNotes(e.target.value)}
            />
            <DialogFooter>
              <Button
                variant="default"
                className={cn(
                  config.background_color,
                  config.hover_background_color,
                  'text-white raised-off-page w-full p-4'
                )}
                onClick={() => {
                  handleRejectOffer()
                }}
              >
                Reject Offer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
