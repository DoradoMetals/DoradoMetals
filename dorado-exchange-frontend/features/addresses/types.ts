import * as z from 'zod'

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

export function makeEmptyAddress(userId?: string): Address {
  return {
    user_id: userId ?? '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    name: '',
    is_default: false,
    phone_number: '',
    country_code: 'US',
    is_valid: false,
    is_residential: false,
  } as Address
}

export type PlacesAddressComponent = {
  types: string[]
  longText?: string
  shortText?: string
}

export type PlacesSuggestionsInput = {
  userId?: string
  sessionToken: google.maps.places.AutocompleteSessionToken
  searchText: string
}

export type PlacesJsPlacePrediction = {
  placeId?: string
  text?: { text?: string }
  structuredFormat?: {
    mainText?: { text?: string }
    secondaryText?: { text?: string } | string
  }
  toPlace: () => google.maps.places.Place

  types?: string[]
  distanceMeters?: number
  description?: string
  mainText?: { text?: string }
  secondaryText?: { text?: string }
}

export type PlacesJsSuggestion = {
  placePrediction: PlacesJsPlacePrediction
}

export type PlacesJsAutocompleteResponse = {
  suggestions?: PlacesJsSuggestion[]
}

export type ParsedPlaceSuggestion = {
  kind: 'place'
  placeId: string
  main: string
  secondary: string | undefined
  fullText: string | undefined
  types: string[] | undefined
  distanceMeters: number | undefined
  raw: PlacesJsPlacePrediction
}

export const stateMap: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming"
}

export const states = Object.values(stateMap) // Extract full state names

export const reverseStateMap = Object.fromEntries(
  Object.entries(stateMap).map(([abbr, full]) => [full, abbr])
) as Record<string, string>;
