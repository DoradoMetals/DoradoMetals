import { z } from 'zod'

export const insuranceSchema = z.object({
  declaredValue: z.object({
    amount: z.number().min(0, { message: 'Amount must be at least 0' }),
    currency: z.literal('USD'),
  }),
  insured: z.boolean(),
})
