import { z } from 'zod/v4'
import { Landmark, PiggyBank, CreditCard, Globe, Mail, Coins } from '@dorado/icons'
// The payout as it arrives on an order is `Payout` in @dorado/contracts, and
// the admin-only full-number read is `PayoutDetails` beside it. A local
// interface restating the first used to sit here with nothing importing it -
// and it carried `time_delay`, which is a column of payments.methods and has
// never been part of that shape.
//
// WHAT STAYS IN THIS FILE IS THE FORM AND THE PICTURES. The four payout forms
// are genuinely new data being typed by a customer (ruling 43's one
// exception), so their schemas are the frontend's; the icons are a client
// concern that has no business on the wire.

export const echeckSchema = z.object({
  account_holder_name: z.string().min(1, 'Addressed to name required'),
  payout_email: z.string().email('Valid email required'),
})

export const achSchema = z.object({
  account_holder_name: z.string().min(1, 'Account holder name is required'),
  bank_name: z.string().min(1, 'Bank name is required'),
  routing_number: z
    .string()
    .min(1, 'Routing number is required')
    .regex(/^\d{9}$/, 'Must be a 9 digit number'),
  account_number: z
    .string()
    .min(1, 'Account number is required')
    .regex(/^\d+$/, 'Must be a number'),
  account_type: z.enum(['Checking', 'Savings']),
  confirmation: z
    .boolean()
    .refine((val) => val === true, { message: 'You must confirm your bank information.' }),
})

export const wireSchema = z.object({
  account_holder_name: z.string().min(1, 'Account holder name is required'),
  bank_name: z.string().min(1, 'Bank name is required'),
  routing_number: z
    .string()
    .min(1, 'Routing number is required')
    .regex(/^\d{9}$/, 'Must be a 9 digit number'),
  account_number: z
    .string()
    .min(1, 'Account number is required')
    .regex(/^\d+$/, 'Must be a number'),
  confirmation: z
    .boolean()
    .refine((val) => val === true, { message: 'You must confirm your bank information.' }),
})

export const doradoAccountSchema = z.object({
  account_holder_name: z.string().min(1, 'Addressed to name required'),
  payout_email: z.string().email('Valid email required'),
})

// NO `cost` FIELD. All four schemas carried one, filled in the step from a
// payments.methods row with a hardcoded `?? 20` fallback for WIRE - a fee
// written into the browser - and it was neither rendered from the form (the
// step shows the ROW's flat_fee) nor sent (toPayoutForm drops it, and the
// strict body would refuse it). A fee is the server's number.

export type EcheckPayout = z.infer<typeof echeckSchema>
export type AchPayout = z.infer<typeof achSchema>
export type WirePayout = z.infer<typeof wireSchema>
export type DoradoPayout = z.infer<typeof doradoAccountSchema>

export const payoutSchema = z.union([
  z.object({ method: z.literal('ACH') }).and(achSchema),
  z.object({ method: z.literal('WIRE') }).and(wireSchema),
  z.object({ method: z.literal('ECHECK') }).and(echeckSchema),
  z.object({ method: z.literal('DORADO_ACCOUNT') }).and(doradoAccountSchema),
])

// `PayoutInput` - the discriminated union restating `payoutSchema` in
// TypeScript - lived here until phase 3. Zero references anywhere in the
// tree, its own file included; `z.infer<typeof payoutSchema>` is the same
// type derived rather than transcribed. Ruling 32: the dead ones go.

export type PayoutMethodType = 'ACH' | 'WIRE' | 'ECHECK' | 'DORADO_ACCOUNT'

// THE PAYOUT OPTIONS COME FROM THE DATABASE NOW (D207). `payoutOptions` -
// four hardcoded records carrying every fee, delay and paragraph of marketing
// copy - duplicated payments.methods (direction=purchase) field for field,
// and migration 109 moved the two paragraphs the table lacked (the long intro
// and the closing details) into it. Consumers read usePaymentMethods('purchase')
// (features/payments/queries) and look rows up by `type`; the column mapping:
//
//   label            label              fit_header    the "great fit" heading
//   short_description the one-line card fit_bullets   the fit list
//   long_description the paragraph      details       the closing paragraphs
//   fit_description  the long intro     flat_fee      cost   time_delay  delay
//
// The ICON is the one thing that stays here, deliberately (Jacob's standing
// call from the handoff conversion): a picture is a client concern and has no
// business on the wire.
export const payoutMethodIcon: Record<PayoutMethodType, any> = {
  ACH: Landmark,
  WIRE: Globe,
  ECHECK: Mail,
  DORADO_ACCOUNT: Coins,
}

export const accountTypeOptions = [
  {
    value: 'Checking',
    label: 'Checking Account',
    description: 'Standard checking account for everyday use',
    icon: CreditCard,
  },
  {
    value: 'Savings',
    label: 'Savings Account',
    description: 'Interest-bearing savings account',
    icon: PiggyBank,
  },
]

// PayoutDetails - returned only by GET /payouts/:id/details (admin only) -
// moved to @dorado/contracts (D214): it is the payout row plus the two
// sealed values opened onto it now, not a hand-picked nine fields. Import it
// from there; features/payouts/queries.ts re-exports it.
