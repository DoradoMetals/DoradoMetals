import * as provider from '#providers/places/google.ts'
import * as rules from '#accounts/places/addresses/rules.ts'
import type { PlaceLookup, PlaceSuggestion } from '@dorado/contracts'

export async function suggest(
  text: string,
  session_token: string | null
): Promise<PlaceSuggestion[]> {
  return await provider.suggest(rules.assertSearchText(text), session_token)
}

export async function lookup(place_id: string): Promise<PlaceLookup> {
  return await provider.lookup(place_id)
}
