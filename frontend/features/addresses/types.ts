import { z } from 'zod/v4'

const blockedCities = ['Test', 'Fake City', 'Unknown', 'N/A']

// SIXTH CONVERTED FEATURE (2026-08-27), types FROM THE CONTRACTS - and the
// wire SPLIT the same day, at Jacob's direction: a postal address and a
// person's relationship to it are different things, so they are different
// entities everywhere. `Address` is the postal row alone; `UserAddress` is
// what one person calls it and whether it is their default, fetched from its
// own endpoint (get_user_addresses) and joined client-side by address_id.
// Writes stay ONE call - the two halves travel as SIBLINGS in the body,
// never nested - so the server keeps the transaction and the frontend never
// orchestrates a two-step save.
//
// THE SCHEMAS COME FROM THE CONTRACTS, AS VALUES - what both sides intake.
// (zod was bumped to 3.25 so the frontend can consume the contracts' v4
// schema objects directly; the restated-and-pinned copies this replaced are
// gone.) addressSchema - the FORM - validates what a human types: the
// postal fields plus the label and default flag as plain form fields, split
// into the two body halves at submit. Its rules are deliberately stricter
// than the columns, the pattern audit:frontend-nullability documents.
import { Address, UserAddressRead } from "@dorado/contracts";

export type UserAddress = UserAddressRead

// The FORM: what a human submits, one flat set of fields for the UX, split
// into { address, user_address } at the mutation edge.
export const addressSchema = z.object({
  id: z.string().uuid().optional(),
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
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  phone_number: z.string(),
  label: z.string().min(1, 'Name is required').trim(),
  default_shipping: z.boolean().optional(),
})

export type AddressFormValues = z.infer<typeof addressSchema>

export function makeEmptyAddress(): AddressFormValues {
  return {
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    phone_number: '',
    country_code: 'US',
    label: '',
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

// The postal fields alone - matches @dorado/contracts' AddressWrite exactly
// (id/created_at/updated_at are read-only, the form carries them for
// display/editing but they are never part of a write).
type AddressWriteFields = Pick<
  AddressFormValues,
  'line_1' | 'line_2' | 'city' | 'state' | 'country' | 'zip' | 'country_code' | 'phone_number'
>

// Split the one form into the two body halves the API writes in one
// transaction. Picks the write fields by NAME rather than spreading
// whatever the form happens to carry - id, created_at, updated_at all ride
// on AddressFormValues for display, and a strict AddressWrite 400s on any
// of the three.
export function splitFormValues(v: AddressFormValues): {
  address: AddressWriteFields
  user_address: { label: string; default_shipping: boolean }
} {
  const { line_1, line_2, city, state, country, zip, country_code, phone_number, label, default_shipping } = v
  return {
    address: { line_1, line_2, city, state, country, zip, country_code, phone_number },
    user_address: { label, default_shipping: default_shipping ?? false },
  }
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

type PlacesJsPlacePrediction = {
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
