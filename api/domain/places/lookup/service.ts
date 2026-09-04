// FINDING AN ADDRESS. Two calls to the places provider, behind two endpoints,
// so a key never reaches a browser and the parse of Google's answer happens
// once, on the server, where it can be tested against a recorded response.
//
// `suggest` is billed per request. `rules.assertSearchText` is the free
// refusal - the browser used to gate this with `searchText.length > 2` and a
// 250 ms debounce, both of which a caller could simply not do.
import * as provider from "#providers/places/google.ts";
import * as rules from "#domain/places/addresses/rules.ts";
import type { PlaceLookup, PlaceSuggestion } from "@dorado/contracts";

export async function suggest(
  text: string, session_token: string | null
): Promise<PlaceSuggestion[]> {
  return await provider.suggest(rules.assertSearchText(text), session_token);
}

export async function lookup(place_id: string): Promise<PlaceLookup> {
  return await provider.lookup(place_id);
}
