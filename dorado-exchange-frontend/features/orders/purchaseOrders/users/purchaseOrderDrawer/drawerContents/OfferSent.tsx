import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Button } from '@/shared/ui/base/button'
import CountdownRing from '@/features/orders/ui/CountdownRing'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/base/dialog'
import { Textarea } from '@/shared/ui/base/textarea'

import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import getPurchaseOrderTotal from '@/utils/purchaseOrders/purchaseOrderTotal'
import { useMemo, useState } from 'react'
import { useSpotPrices } from '@/features/spots/queries'
import { useAcceptOffer, usePurchaseOrderMetals, useRejectOffer } from '@/features/orders/purchaseOrders/users/queries'

export default function OfferSentPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const [open, setOpen] = useState(false)
  const [rejectedNotes, setRejectedNotes] = useState('')

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)
  const acceptOffer = useAcceptOffer()
  const rejectOffer = useRejectOffer()

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])

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
      <div className="mb-4">
        <div className="flex items-center w-full justify-between">
          <div className="text-2xl text-neutral-900">Offered Payout:</div>
          <div className="text-2xl text-neutral-900">
            <PriceNumberFlow value={total} />
          </div>
        </div>
        <div className="flex flex-col gap-4 h-full w-full items-center justify-center">
          <CountdownRing sentAt={order.offer_sent_at!} expiresAt={order.offer_expires_at!} />
          {order.spots_locked ? (
            <p className="text-sm text-neutral-700 mb-6 lg:px-8 text-left">
              Spots have been locked for your order. You will have 24 hours to accept or
              reject our offer, after which we will unlock the current spots.
            </p>
          ) : (
            <p className="text-sm text-neutral-700 mb-6 lg:px-8 text-left">
              Spots have not been locked for your order. You will have 1 week to accept or
              reject our offer, after which it will automatically be accepted on your behalf.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center w-full gap-2">
        <Button
          variant="default"
          className="text-white raised-off-page w-full p-4 bg-primary hover:bg-primary"
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
              className="hover:text-white raised-off-page w-full p-4 bg-card text-primary hover:bg-primary"
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
                className="text-white raised-off-page w-full p-4 bg-primary hover:bg-primary"
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
