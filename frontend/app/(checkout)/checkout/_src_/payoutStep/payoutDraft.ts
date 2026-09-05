'use client'

import { create } from 'zustand'
import type { z } from 'zod'
import type { CheckoutPayoutForm } from '@dorado/contracts'
import {
  achSchema,
  doradoAccountSchema,
  echeckSchema,
  payoutSchema,
  wireSchema,
  type PayoutMethodType,
} from '@/shared/types/payouts'

// The union of what the four forms hold, all optional - a draft is by
// definition half-typed. Derived from the same schemas the forms resolve
// against, so a field added to one appears here without being restated.
// `confirmation` and `cost` live here and nowhere else: the first is a
// checkbox, the second a displayed fee, and the strict wire body refuses both.
type PayoutValues = Partial<
  z.infer<typeof achSchema> &
    z.infer<typeof wireSchema> &
    z.infer<typeof echeckSchema> &
    z.infer<typeof doradoAccountSchema>
> & { method: PayoutMethodType }

// THE ONE THING THE SERVER CANNOT HOLD: a half-typed bank form.
//
// It is not a mirror of `checkout.checkouts` - the row keeps only
// `payment_details_id`, and the two numbers are sealed at rest and never come
// back - so the draft the customer is still typing lives here, unpersisted,
// until "Review Order" POSTs it. Everything else the old
// purchaseOrderCheckoutStore held (the address, the box, the service, the
// handoff, the schedule) is a column of the checkout row and was deleted with
// that store.
//
// VALIDITY IS DERIVED, NOT STORED. The step used to keep a `payoutValid` flag
// that two effects wrote from four `formState.isValid` flags; the draft itself
// answers the question - `payoutSchema` is the same union the forms resolve
// against, so a caller parses what it holds instead of watching what a form
// said.
type Draft = {
  payout: PayoutValues | null
  setPayout: (payout: PayoutValues) => void
  clear: () => void
}

export const usePayoutDraft = create<Draft>()((set) => ({
  payout: null,
  setPayout: (payout) => set({ payout }),
  clear: () => set({ payout: null }),
}))

export const isPayoutComplete = (draft: Draft['payout']): boolean =>
  !!draft && payoutSchema.safeParse(draft).success

// The seven columns POST /checkout/payout accepts, picked out of a form that
// also carries a confirmation checkbox and a displayed cost - both would be
// refused as unknown keys by the strict body.
export const toPayoutForm = (draft: PayoutValues): CheckoutPayoutForm => ({
  method: draft.method,
  account_holder_name: draft.account_holder_name ?? '',
  bank_name: draft.bank_name ?? null,
  account_type: draft.account_type ?? null,
  routing_number: draft.routing_number ?? null,
  account_number: draft.account_number ?? null,
  payout_email: draft.payout_email ?? null,
})
