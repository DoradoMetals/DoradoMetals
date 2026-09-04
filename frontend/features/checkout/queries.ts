'use client'

// THE CHECKOUT ROW, AS THIS APP SEES IT (ruling 62). Every endpoint now lives
// in `@dorado/client`; what is left here is the two things that package
// deliberately does not know about - who is signed in, and which direction a
// purchase surface is looking at. A hook here is a session-gated re-export,
// never a request.
import {
  useCheckout,
  useCheckoutRates,
  usePackages,
  usePatchCheckout,
  usePlaceOrderFromCheckout,
  useSaveCheckoutPayout,
  useSetCheckoutFulfillment,
} from '@dorado/client'
import { useGetSession } from '@/features/auth/queries'

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
  useCheckoutRates,
  usePatchCheckout,
  usePlaceOrderFromCheckout,
  useSaveCheckoutPayout,
  useSetCheckoutFulfillment,
}
