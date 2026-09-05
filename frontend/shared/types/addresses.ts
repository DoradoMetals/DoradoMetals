import { z } from 'zod/v4'

const blockedCities = ['Test', 'Fake City', 'Unknown', 'N/A']

// WHAT A HUMAN TYPES INTO THE ADDRESS FORM, and nothing else.
//
// The wire shapes are the contracts' - `AddressBookEntry` for the read,
// `AddressWriteBody` for the write - and the API decides everything else: the
// default pick, whether an address may still be edited, the residential flag,
// and what a Google suggestion resolves into. What is left here is FORM
// validation, deliberately stricter than the columns (the pattern
// audit:frontend-nullability documents), plus the state map the combobox reads.
//
// `recipient_name` and `label` are two fields now (migration 127): who signs
// for the parcel, and what the book calls it. They were one column wearing the
// wrong name - the form asked for an "Address Name" with the placeholder
// "Home" and every real value in it was a person.
import { Address, UserAddressRead } from '@dorado/contracts'

export type UserAddress = UserAddressRead

export const addressSchema = z.object({
  recipient_name: z.string().min(1, 'Recipient name is required').trim(),
  label: z.string().trim().optional(),
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
    error: 'Country must be United States',
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
  phone_number: z.string(),
  default_shipping: z.boolean().optional(),
})

export type AddressFormValues = z.infer<typeof addressSchema>

export function makeEmptyAddress(): AddressFormValues {
  return {
    recipient_name: '',
    label: '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    phone_number: '',
    country_code: 'US',
    default_shipping: false,
  } as AddressFormValues
}

// An empty row of the WIRE shape, for call sites that must send an address
// before one is picked (the tax quote reads only `state`, and a blank state
// accrues nothing). The FORM's empty value is makeEmptyAddress().
export function makeEmptyWireAddress(): Address {
  return {
    id: '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    country_code: 'US',
    zip: '',
    phone_number: '',
    is_valid: false,
    is_residential: false,
    created_at: '',
    updated_at: '',
  }
}

export const stateMap: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

export const states = Object.values(stateMap) // Extract full state names

export const reverseStateMap = Object.fromEntries(
  Object.entries(stateMap).map(([abbr, full]) => [full, abbr])
) as Record<string, string>
