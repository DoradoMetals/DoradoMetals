import { requiredEnv } from '#shared/env/required.ts'
import type { PlaceLookup, PlaceSuggestion } from '@dorado/contracts'

const HOST = 'https://places.googleapis.com'

type Prediction = {
  placeId?: string
  text?: { text?: string }
  structuredFormat?: {
    mainText?: { text?: string }
    secondaryText?: { text?: string }
  }
}

type Component = { types?: string[]; longText?: string; shortText?: string }
type LatLng = { latitude?: number; longitude?: number }

const key = (): string => requiredEnv('GOOGLE_PLACES_API_KEY')

async function ask<T>(path: string, body: unknown, mask: string): Promise<T> {
  const response = await fetch(`${HOST}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
      'X-Goog-FieldMask': mask,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const parsed: unknown = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? JSON.stringify((parsed as { error: unknown }).error)
        : `${response.status}`
    throw new Error(`places provider refused: ${message}`)
  }
  return parsed as T
}

const suggestionOf = (p: Prediction): PlaceSuggestion | null => {
  const place_id = p.placeId ?? ''
  const main = (p.structuredFormat?.mainText?.text ?? p.text?.text ?? '').trim()
  if (!place_id || !main) return null
  return {
    place_id,
    main,
    secondary: p.structuredFormat?.secondaryText?.text?.trim() || null,
  }
}

export async function suggest(
  input: string,
  sessionToken: string | null
): Promise<PlaceSuggestion[]> {
  const body = await ask<{ suggestions?: { placePrediction?: Prediction }[] }>(
    '/v1/places:autocomplete',
    { input, includedRegionCodes: ['us'], sessionToken: sessionToken ?? undefined },
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,' +
      'suggestions.placePrediction.structuredFormat'
  )
  const out: PlaceSuggestion[] = []
  for (const s of body.suggestions ?? []) {
    const mapped = s.placePrediction ? suggestionOf(s.placePrediction) : null
    if (mapped) out.push(mapped)
  }
  return out
}

const component = (comps: Component[], type: string, kind: 'short' | 'long'): string | null => {
  const c = comps.find((x) => x.types?.includes(type))
  if (!c) return null
  return (kind === 'short' ? c.shortText : c.longText) || null
}

export async function lookup(place_id: string): Promise<PlaceLookup> {
  const place = await ask<{
    formattedAddress?: string
    addressComponents?: Component[]
    location?: LatLng
  }>(
    `/v1/places/${encodeURIComponent(place_id)}`,
    undefined,
    'formattedAddress,addressComponents,location'
  )
  const comps = place.addressComponents ?? []
  const line_1 = [component(comps, 'street_number', 'short'), component(comps, 'route', 'short')]
    .filter(Boolean)
    .join(' ')

  return {
    line_1: line_1 || null,
    line_2: null,
    city:
      component(comps, 'locality', 'long') ??
      component(comps, 'sublocality', 'long') ??
      component(comps, 'postal_town', 'long'),
    state: component(comps, 'administrative_area_level_1', 'short'),
    zip: component(comps, 'postal_code', 'short'),
    country: component(comps, 'country', 'long'),
    country_code: component(comps, 'country', 'short'),
    phone_number: null,
    formatted_address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  }
}
