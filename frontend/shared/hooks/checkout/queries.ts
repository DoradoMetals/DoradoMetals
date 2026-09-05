'use client'

// THE CHECKOUT ROW, AS THIS APP SEES IT (ruling 62). Every endpoint now lives
// in `@dorado/client`; what is left here is the two things that package
// deliberately does not know about - who is signed in, and which direction a
// purchase surface is looking at. A hook here is a session-gated re-export,
// never a request.
//
// THE HANDOVER HOOKS ARE FULFILLMENTS' (rulings 69/70). The stepper's shipping
// step patches `useCreateFulfillment` / `usePatchFulfillment` and reads its
// rates from `useFulfillmentRates`; `useSetCheckoutFulfillment` and
// `useCheckoutRates` are gone with the columns they wrote.
import {
  useCheckout,
  useCreateFulfillment,
  useFulfillment,
  useFulfillmentRates,
  usePackages,
  usePatchCheckout,
  usePatchFulfillment,
  usePlaceOrderFromCheckout,
  useSaveCheckoutPayout,
} from '@dorado/client'
import { useGetSession } from '@/shared/hooks/auth/queries'

export const usePurchaseCheckoutRow = () => {
  const { user } = useGetSession()
  return useCheckout('purchase', { enabled: !!user?.id })
}

export const useSaleCheckoutRow = () => {
  const { user } = useGetSession()
  return useCheckout('sale', { enabled: !!user?.id })
}

export const useOfferedPackages = () => {
  const { user } = useGetSession()
  return usePackages({ enabled: !!user?.id })
}

export {
  useCreateFulfillment,
  useFulfillment,
  useFulfillmentRates,
  usePatchCheckout,
  usePatchFulfillment,
  usePlaceOrderFromCheckout,
  useSaveCheckoutPayout,
}
