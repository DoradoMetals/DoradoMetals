import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import type { payments } from '@dorado/contracts'

// THE METHOD ROWS, BOTH DIRECTIONS (D207): how a customer pays us
// (direction=sale - the checkout's payment options) and how we pay a customer
// (direction=purchase - the payout options, marketing copy included). The
// frontend used to hardcode all of it in two arrays that had already drifted
// from the table 047 seeded; GET /api/payments/methods makes the rows the one
// source. Icons stay a client-side map beside each selector (Jacob's standing
// call from the handoff conversion) - nothing visual rides the wire.
//
// Fees and surcharges here are DISPLAY. The server's calculateCardCharge is
// the pricing authority, and api/features/pricing/tests/reference-drift pins
// the CARD and ACH rows to its constants.
export type PaymentMethodRow = payments.MethodsRow

const REFERENCE_STALE_TIME = 60 * 60 * 1000

export const usePaymentMethods = (direction: 'sale' | 'purchase') =>
  useApiQuery<PaymentMethodRow[]>({
    key: queryKeys.paymentMethods(direction),
    url: `/payments/methods?direction=${direction}`,
    // Public, like the endpoint: the product page and the payout landing
    // render these rows to signed-out visitors.
    requireUser: false,
    staleTime: REFERENCE_STALE_TIME,
  })
