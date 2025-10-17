// --- payout.ts ---
import { z } from 'zod'
import {
  BankIcon,
  PiggyBankIcon,
  CreditCardIcon,
  GlobeIcon,
  EnvelopeIcon,
  UserIcon,
  CoinsIcon,
} from '@phosphor-icons/react'

export interface Payout {
  id: string
  user_id: string
  order_id: string
  method: string
  account_holder_name: string
  bank_name?: string
  account_type?: string
  routing_number?: string
  account_number?: string
  created_at: Date
  email_to?: string
  cost: number
  time_delay: string
}

export const echeckSchema = z.object({
  account_holder_name: z.string().min(1, 'Addressed to name required'),
  payout_email: z.string().email('Valid email required'),
  cost: z.number(),
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
  cost: z.number(),
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
  cost: z.number(),
})

export const doradoAccountSchema = z.object({
  account_holder_name: z.string().min(1, 'Addressed to name required'),
  payout_email: z.string().email('Valid email required'),
  cost: z.number(),
})

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

export type PayoutInput =
  | ({ method: 'ACH' } & AchPayout)
  | ({ method: 'WIRE' } & WirePayout)
  | ({ method: 'ECHECK' } & EcheckPayout)
  | ({ method: 'DORADO_ACCOUNT' } & DoradoPayout)

export type PayoutMethodType = 'ACH' | 'WIRE' | 'ECHECK' | 'DORADO_ACCOUNT'

export interface PayoutMethod {
  method: PayoutMethodType
  label: string
  description?: string
  icon: any
  cost: number
  time_delay: string
  paragraph: string
}

export const payoutOptions: PayoutMethod[] = [
  {
    method: 'ACH',
    label: 'ACH Transfer',
    description: 'Direct deposit to a U.S. bank account',
    icon: BankIcon,
    cost: 0.0,
    time_delay: '1-3 days',
    paragraph: 'Direct deposit to bank accounts utilizing the automated clearing house network. Transfers in 1-3 business days.',
  },
  {
    method: 'WIRE',
    label: 'Wire Transfer',
    description: 'Domestic wire transfer to your bank',
    icon: GlobeIcon,
    cost: 20.0,
    time_delay: '1-5 hours',
    paragraph: 'Fast and secure electronic transfer of funds between bank accounts often used for large sums of money. Processes in hours.',
  },
  {
    method: 'ECHECK',
    label: 'Deluxe eCheck',
    description: 'Digital check sent to your email',
    icon: EnvelopeIcon,
    cost: 0.0,
    time_delay: 'Instant',
    paragraph: 'Digital check sent to your email. Can be printed out and deposited with your bank, or direct deposited through Deluxe. Processes instantly.',
  },
  {
    method: 'DORADO_ACCOUNT',
    label: 'Bullion Exchange',
    description: 'Bullion shipped to you',
    icon: CoinsIcon,
    cost: 0.0,
    time_delay: '5-7 days',
    paragraph: 'In lieu of a cash payout, receive bullion of your choosing equal to the value of your metal. Arrives within one week.',
  },
]

export const accountTypeOptions = [
  {
    value: 'Checking',
    label: 'Checking Account',
    description: 'Standard checking account for everyday use',
    icon: CreditCardIcon,
  },
  {
    value: 'Savings',
    label: 'Savings Account',
    description: 'Interest-bearing savings account',
    icon: PiggyBankIcon,
  },
]
