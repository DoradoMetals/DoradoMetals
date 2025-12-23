import {
  Address,
  ParsedPlaceSuggestion,
  PlacesAddressComponent,
  PlacesJsSuggestion,
} from '@/features/addresses/types'

export function formatAddressSearchText(address?: Partial<Address>) {
  const line = address?.line_1 ?? ''
  const city = address?.city ?? ''
  const state = address?.state ?? ''
  const zip = address?.zip ?? ''

  const combined = `${line}${city ? `, ${city}` : ''}${state ? `, ${state}` : ''}${
    zip ? ` ${zip}` : ''
  }`
  return combined.trim()
}

function getPlacesComponent(
  comps: PlacesAddressComponent[],
  type: string,
  kind: 'short' | 'long' = 'short'
) {
  const c = comps.find((x) => x.types?.includes(type))
  if (!c) return ''
  return kind === 'short' ? c.shortText ?? '' : c.longText ?? ''
}

export function placeToAddressFields(place: google.maps.places.Place) {
  const comps = (place.addressComponents ?? []) as PlacesAddressComponent[]
  if (!comps.length) return null

  const streetNumber = getPlacesComponent(comps, 'street_number', 'short')
  const route = getPlacesComponent(comps, 'route', 'short')
  const line_1 = [streetNumber, route].filter(Boolean).join(' ').trim()

  const city =
    getPlacesComponent(comps, 'locality', 'long') ||
    getPlacesComponent(comps, 'sublocality', 'long') ||
    getPlacesComponent(comps, 'postal_town', 'long')

  const state = getPlacesComponent(comps, 'administrative_area_level_1', 'short')
  const zip = getPlacesComponent(comps, 'postal_code', 'short')

  return {
    line_1,
    city,
    state,
    zip,
    country: 'United States' as const,
    is_valid: true as const,
  }
}

const isNotNull = <T>(x: T | null): x is T => x !== null

const pickMain = (p: any) =>
  (
    p?.structuredFormat?.mainText?.text ||
    p?.mainText?.text ||
    p?.text?.text ||
    p?.description ||
    ''
  ).trim()

const pickSecondary = (p: any) => {
  const sec =
    (typeof p?.structuredFormat?.secondaryText === 'string'
      ? p?.structuredFormat?.secondaryText
      : p?.structuredFormat?.secondaryText?.text) ||
    p?.secondaryText?.text ||
    ''
  return sec.trim() || undefined
}

export function parsePlacesJsAutocomplete(list: PlacesJsSuggestion[]): ParsedPlaceSuggestion[] {
  return (list ?? [])
    .map((s) => {
      const p = s.placePrediction
      const placeId = p?.placeId ?? ''
      const main = pickMain(p)
      if (!placeId || !main) return null

      return {
        kind: 'place',
        placeId,
        main,
        secondary: pickSecondary(p),
        fullText: p?.text?.text,
        types: p?.types,
        distanceMeters: p?.distanceMeters,
        raw: p,
      } satisfies ParsedPlaceSuggestion
    })
    .filter(isNotNull)
}
