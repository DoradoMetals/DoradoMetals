import { Button } from '@/shared/ui/base/button'



import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'
import { useMemo, useState } from 'react'
import getPurchaseOrderTotal from '@/utils/purchaseOrders/purchaseOrderTotal'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import CountdownRing from '@/features/orders/ui/CountdownRing'
import { Textarea } from '@/shared/ui/base/textarea'
import { cn } from '@/shared/utils/cn'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/base/dialog'
import { packageOptions } from '@/features/packaging/types'
import { pickupOptions } from '@/features/handoff/types'
import { serviceOptions } from '@/features/service/types'

import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { ShieldCheckIcon, ShieldSlashIcon } from '@phosphor-icons/react'
import { FedexRateInput, formatFedexRatesAddress } from '@/features/fedex/types'
import { useFedExRates } from '@/features/fedex/queries'
import { getReturnDeclaredValue } from '@/utils/purchaseOrders/getDeclaredValue'
import { useSpotPrices } from '@/features/spots/queries'
import { useAcceptOffer, useCancelOrder, usePurchaseOrderMetals, useUpdateOfferNotes } from '@/features/orders/purchaseOrders/users/queries'

export default function RejectedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const acceptOffer = useAcceptOffer()
  const cancelOrder = useCancelOrder()
  const updateOfferNotes = useUpdateOfferNotes()

  const [offerNotes, setOfferNotes] = useState(order.offer_notes ?? '')
  const [open, setOpen] = useState(false)
  const [insureReturn, setInsureReturn] = useState(false)

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
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])

  const declaredValue = useMemo(() => {
    return getReturnDeclaredValue(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])

  const matchedService = serviceOptions.FEDEX_EXPRESS_SAVER
  const selectedPackage = packageOptions[1]
  const selectedPickup = pickupOptions.DROPOFF_AT_FEDEX_LOCATION

  const fedexRatesInput = useMemo(
    (): FedexRateInput => ({
      shippingType: 'Return',
      customerAddress: formatFedexRatesAddress(order.address),
      pickupType: selectedPickup.label,
      packageDetails: {
        weight: selectedPackage.weight,
        dimensions: selectedPackage.dimensions,
      },
      ...(insureReturn
        ? {
            declaredValue: {
              amount: declaredValue,
              currency: 'USD' as const,
            },
          }
        : {}),
    }),
    [order.address, insureReturn, declaredValue, selectedPackage, selectedPickup]
  )

  const { data: rates = [], isLoading: ratesLoading } = useFedExRates(fedexRatesInput)

  const selectedRate = rates.find((r) => r.serviceType === matchedService.serviceType)

  const returnShipment = {
    address: order.address,
    package: selectedPackage,
    pickup: selectedPickup,
    service: {
      ...matchedService,
      serviceType: matchedService.serviceType,
      serviceDescription: matchedService.serviceDescription ?? '',
      netCharge: selectedRate?.netCharge ?? 0,
      currency: selectedRate?.currency ?? 'USD',
      transitTime: selectedRate?.transitTime ?? new Date(),
      deliveryDay: selectedRate?.deliveryDay ?? '',
    },
    insurance: {
      declaredValue: {
        amount: insureReturn ? declaredValue : 0.0,
        currency: 'USD' as const,
      },
      insured: insureReturn,
    },
  }

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
                Please consider leaving us a note as to why you
                rejected our initial offer. We will be in touch soon if we choose to update your offer.
              </div>
              <div className="flex flex-col gap-0 w-full">
                <Textarea
                  className="input-floating-label-form min-h-30"
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value)}
                />
                <Button
                  variant="link"
                  className="p-0 ml-auto text-primary"
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
              <CountdownRing sentAt={order.offer_sent_at!} expiresAt={order.offer_expires_at!} />
            </div>
          </div>
        )}
        <div className="flex flex-col items-center w-full gap-2 mt-auto">
          <Button
            variant="default"
            className="text-white raised-off-page w-full p-4 bg-primary hover:bg-primary"
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
                className="text-primary hover:text-white raised-off-page w-full p-4 bg-card hover:bg-primary"
              >
                Cancel Order
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background">
              <DialogHeader>
                <DialogTitle className="text-left">Cancel Order?</DialogTitle>
              </DialogHeader>
              <DialogDescription>
                We're sorry we could not meet your price expectations. We will get your items ready
                for return. Before your items are returned, you will need to pay the shipping
                charges, including the return shipment. Please select if you would like your return
                shipment insured.
              </DialogDescription>

              <RadioGroup
                value={insureReturn ? 'insured' : 'uninsured'}
                onValueChange={(value) => setInsureReturn(value === 'insured')}
                className="flex items-center w-full justify-between"
              >
                {['insured', 'uninsured'].map((option) => {
                  const Icon = option === 'insured' ? ShieldCheckIcon : ShieldSlashIcon

                  return (
                    <label
                      key={option}
                      htmlFor={option}
                      className={cn(
                        'raised-off-page relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md'
                      )}
                    >
                      <Icon size={28} className="text-primary" />
                      <div className="text-xs sm:text-sm text-neutral-800 font-medium capitalize">
                        {option}
                      </div>
                      <RadioGroupItem id={option} value={option} className="sr-only" />
                    </label>
                  )
                })}
              </RadioGroup>
              <div className="flex w-full justify-between items-center">
                <div>Return Charge:</div>
                {selectedRate?.netCharge != null ? (
                  <PriceNumberFlow value={selectedRate.netCharge} />
                ) : (
                  <span className="text-neutral-500 select-none">Loading...</span>
                )}
              </div>
              <div className="flex w-full justify-between items-center">
                <div>Total Charge:</div>
                {selectedRate?.netCharge != null ? (
                  <PriceNumberFlow
                    value={order.shipment.shipping_charge + selectedRate.netCharge}
                  />
                ) : (
                  <span className="text-neutral-500 select-none">Loading...</span>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="default"
                  className="text-white raised-off-page w-full p-4 bg-primary hover:bg-primary"
                  onClick={() => {
                    cancelOrder.mutate({ purchase_order: order, return_shipment: returnShipment })
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
