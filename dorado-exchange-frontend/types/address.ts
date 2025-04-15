import * as z from 'zod'
import { reverseStateMap, stateMap, states } from './states'

const blockedCities = ['Test', 'Fake City', 'Unknown', 'N/A']

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  line_1: z
    .string()
    .min(1, 'Address Line 1 is required')
    .max(100, 'Address Line 1 is too long')
    .trim()
    .regex(/^[a-zA-Z0-9\s.,'-]+$/, 'Invalid characters in Address Line 1'),
  line_2: z.string().optional(),
  city: z
    .string()
    .min(1, 'City is required')
    .max(50, 'City name is too long')
    .trim()
    .refine((val) => !blockedCities.includes(val), {
      message: 'Invalid city name',
    }),
  state: z
  .string()
  .transform((val) => reverseStateMap[val] || val.toUpperCase())
  .refine((val) => val in stateMap, {
    message: 'Invalid US state.',
  }),
  country: z.literal('United States', {
    errorMap: () => ({ message: 'Country must be United States' }),
  }),
  country_code: z.string(),
  zip: z
    .string()
    .min(5, 'Zip Code must be at least 5 digits')
    .max(10, 'Zip Code cannot be longer than 10 characters')
    .regex(/^\d{5}(-\d{4})?$/, 'Invalid Zip Code format (e.g., 12345 or 12345-6789)')
    .refine((val) => !isNaN(Number(val.replace('-', ''))), {
      message: 'Zip Code must only contain numbers',
    }),
  name: z.string().min(1, 'Name is required').trim(),
  is_default: z.boolean().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  phone_number: z.string(),
  is_valid: z.boolean(),
  is_residential: z.boolean(),
})

export type Address = z.infer<typeof addressSchema>
