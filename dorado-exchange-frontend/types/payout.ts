// --- payout.ts ---
import { z } from 'zod'
import { Bank, PiggyBank, CreditCard, Globe, Envelope } from '@phosphor-icons/react'

export interface Payout {
  id: string,
  user_id: string,
  order_id: string,
  method: string,
  account_holder_name: string,
  bank_name?: string,
  account_type?: string,
  routing_number?: string,
  account_number?: string,
  created_at: Date,
  email_to?: string,
  cost: number,
  time_delay: string,
}

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
  account_number: z.string().min(1, 'Account number is required').regex(/^\d+$/, 'Must be a number'),
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
  account_number: z.string().min(1, 'Account number is required').regex(/^\d+$/, 'Must be a number'),
  confirmation: z
  .boolean()
  .refine((val) => val === true, { message: 'You must confirm your bank information.' }),
})

export type EcheckPayout = z.infer<typeof echeckSchema>
export type AchPayout = z.infer<typeof achSchema>
export type WirePayout = z.infer<typeof wireSchema>

export const payoutSchema = z.union([
  z.object({ method: z.literal('ACH') }).and(achSchema),
  z.object({ method: z.literal('WIRE') }).and(wireSchema),
  z.object({ method: z.literal('ECHECK') }).and(echeckSchema),
])

export type PayoutInput =
  | ({ method: 'ACH' } & AchPayout)
  | ({ method: 'WIRE' } & WirePayout)
  | ({ method: 'ECHECK' } & EcheckPayout)

export type PayoutMethodType = 'ACH' | 'WIRE' | 'ECHECK'

export interface PayoutMethod {
  method: PayoutMethodType
  label: string
  description?: string
  icon: any
  cost: number,
  time_delay: string
}

export const payoutOptions: PayoutMethod[] = [
  {
    method: 'ACH',
    label: 'ACH Transfer',
    description: 'Direct deposit to a U.S. bank account',
    icon: Bank,
    cost: 0.00,
    time_delay: '1-24 hours',
  },
  {
    method: 'WIRE',
    label: 'Wire Transfer',
    description: 'Domestic wire transfer to your bank',
    icon: Globe,
    cost: 20.00,
    time_delay: '1-5 hours',
  },
  {
    method: 'ECHECK',
    label: 'Deluxe eCheck',
    description: 'Digital check sent to your email',
    icon: Envelope,
    cost: 0.00,
    time_delay: 'Instant',
  },
]

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
