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

// --- payout.ts ---

export interface PayoutMethod {
  method: PayoutMethodType
  label: string
  description?: string
  icon: any
  cost: number
  time_delay: string
  paragraph: string // short summary (card / checkout)
  longIntro: string
  fitHeading: string
  fitBullets: string[]
  details: string[]
}

export const payoutOptions: PayoutMethod[] = [
  {
    method: 'ACH',
    label: 'ACH Transfer',
    description: 'Direct deposit to a U.S. bank account',
    icon: BankIcon,
    cost: 0.0,
    time_delay: '1-3 business days',
    paragraph:
      'Direct deposit to your U.S. bank account via ACH. A low-fee option that typically arrives in 1-3 business days.',
    longIntro:
      "ACH (Automated Clearing House) is one of the most common and trusted ways to move money between banks in the U.S. With this option, we send your payout directly to your checking or savings account—no paper checks, no branch visits, and no extra steps once it's set up.",
    fitHeading: 'ACH is a great fit if you:',
    fitBullets: [
      'Prefer a low-fee or no-fee payout method',
      'Are comfortable waiting 1-3 business days for your bank to post the deposit',
      'Want your funds to arrive quietly and securely in your bank account',
    ],
    details: [
      "Once your metal is received, verified, and your payout is approved, we initiate the transfer the same business day whenever possible (subject to our processing cutoff times). From there, your bank's ACH schedule determines when the funds show up, but you'll receive a confirmation from us as soon as the transfer is sent.",
      "All you need is your bank name, routing number, and account number. We transmit this information securely and never use it for anything other than sending your payout.",
    ],
  },
  {
    method: 'WIRE',
    label: 'Wire Transfer',
    description: 'Domestic wire transfer to your bank',
    icon: GlobeIcon,
    cost: 20.0,
    time_delay: '1-3 hours',
    paragraph:
      'Direct wire transfer from our bank to yours. Best for larger payouts when you need funds as quickly as possible.',
    longIntro:
      "Wire transfers are designed for speed and reliability, especially when you're dealing with larger dollar amounts. With a wire, funds are sent directly from our bank to yours, often arriving the same business day once the wire is released (depending on bank cut-off times and your bank's policies).",
    fitHeading: 'Wire is a great fit if you:',
    fitBullets: [
      'Need access to your funds as quickly as possible',
      'Are moving a larger payout and want a direct bank-to-bank transfer',
      "Don't mind that your bank may charge an incoming wire fee",
    ],
    details: [
      "After your shipment is received and your payout is approved, we prepare and release the wire during our normal banking hours. You'll receive a confirmation with the amount and reference details so you can easily track it with your bank.",
      "Some banks may place temporary holds on large incoming wires or require additional verification. While that's outside our control, we're happy to provide any supporting documentation you might need if your bank asks for it.",
    ],
  },
  {
    method: 'ECHECK',
    label: 'Deluxe eCheck',
    description: 'Digital check sent to your email',
    icon: EnvelopeIcon,
    cost: 0.0,
    time_delay: 'Instant',
    paragraph:
      "Digital check delivered to your email. Print and deposit, or use mobile deposit at most banks and credit unions.",
    longIntro:
      "A Deluxe eCheck gives you the convenience of a traditional check without waiting for the mail. Once your payout is ready, we issue a secure digital check and send it straight to your email.",
    fitHeading: 'eCheck is a great fit if you:',
    fitBullets: [
      'Want fast access to funds without sharing bank account details',
      'Prefer something that can be deposited at almost any bank or credit union',
      'Like having a printable record of your payout for your own files',
    ],
    details: [
      "From your email, you can print the check and deposit it in person, use your bank's mobile app to deposit from your phone, or use supported Deluxe tools for direct electronic deposit.",
      "We typically issue eChecks the same day your payout is finalized. The check is drawn on a standard U.S. bank account and is processed by your bank just like any other check, subject to their normal hold times. All you need is a valid email address you can access securely.",
    ],
  },
  {
    method: 'DORADO_ACCOUNT',
    label: 'Bullion Exchange',
    description: 'Bullion shipped to you',
    icon: CoinsIcon,
    cost: 0.0,
    time_delay: '3-7 days',
    paragraph:
      'Convert your payout directly into eligible coins and bars instead of taking cash. Bullion is fully insured and shipped to you.',
    longIntro:
      "If your goal is to build or grow your precious-metals holdings, you don't have to take your payout in cash at all. With Bullion Exchange, you can apply some or all of your proceeds toward eligible coins and bars instead of receiving a cash payment.",
    fitHeading: 'Bullion Exchange is a great fit if you:',
    fitBullets: [
      'Want to move from scrap or unwanted items into investable bullion',
      'Prefer to store value in physical metal rather than holding cash',
      'Like the idea of “trading up” into coins and bars in a single transaction',
    ],
    details: [
      "Once your metal is received and your payout is calculated, you can choose the bullion you'd like from our available inventory. We lock in pricing at the time of your selection, provide a clear breakdown of how your payout is applied (including any premiums and shipping), and confirm your final order total before anything is finalized.",
      "After you approve the conversion, your bullion order is packed, fully insured, and shipped to you—typically within about a week, depending on product availability and shipping method. You'll receive tracking information so you can follow delivery every step of the way.",
    ],
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
