// THE PLACES PROVIDER, SERVER-SIDE.
//
// It ran in the browser: `google.maps.places.AutocompleteSuggestion` and
// `place.fetchFields`, driven by a key shipped to every visitor as
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Two things were wrong with that beyond the
// exposed key - the parse of Google's answer (four spellings of the same
// string, a components array searched by type) was 90 lines of business rule
// in `features/addresses/utils/places.ts`, and Google bills per keystroke with
// nothing server-side able to see, cap or cache the spend.
//
// This is the Places API (New) REST surface, which is what the JS SDK calls
// anyway. Nothing here decides anything: it asks, and it maps the answer onto
// the shapes the contracts declare.
import { requiredEnv } from "#shared/env/required.ts";
import type { PlaceLookup, PlaceSuggestion } from "@dorado/contracts";

const HOST = "https://places.googleapis.com";

// The autocomplete answer, as much of it as the field mask asks for. Declared
// structurally rather than imported: this is another service's JSON, and a
// type that claims more than the mask requests is a lie about what arrives.
type Prediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

type Component = { types?: string[]; longText?: string; shortText?: string };
type LatLng = { latitude?: number; longitude?: number };

const key = (): string => requiredEnv("GOOGLE_PLACES_API_KEY");

async function ask<T>(path: string, body: unknown, mask: string): Promise<T> {
  const response = await fetch(`${HOST}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": mask,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? JSON.stringify((parsed as { error: unknown }).error)
        : `${response.status}`;
    throw new Error(`places provider refused: ${message}`);
  }
  return parsed as T;
}

// ONE STRING SURVIVES PER HALF. Google returns the same text under four keys
// depending on which surface asked; the browser's parser tried all of them in
// order and this keeps the two the mask actually requests.
const suggestionOf = (p: Prediction): PlaceSuggestion | null => {
  const place_id = p.placeId ?? "";
  const main = (p.structuredFormat?.mainText?.text ?? p.text?.text ?? "").trim();
  if (!place_id || !main) return null;
  return {
    place_id,
    main,
    secondary: p.structuredFormat?.secondaryText?.text?.trim() || null,
  };
};

export async function suggest(
  input: string, sessionToken: string | null
): Promise<PlaceSuggestion[]> {
  const body = await ask<{ suggestions?: { placePrediction?: Prediction }[] }>(
    "/v1/places:autocomplete",
    // sessionToken is what makes a burst of keystrokes and the lookup that
    // follows ONE billed session rather than N.
    { input, includedRegionCodes: ["us"], sessionToken: sessionToken ?? undefined },
    "suggestions.placePrediction.placeId,suggestions.placePrediction.text," +
      "suggestions.placePrediction.structuredFormat"
  );
  const out: PlaceSuggestion[] = [];
  for (const s of body.suggestions ?? []) {
    const mapped = s.placePrediction ? suggestionOf(s.placePrediction) : null;
    if (mapped) out.push(mapped);
  }
  return out;
}

const component = (
  comps: Component[], type: string, kind: "short" | "long"
): string | null => {
  const c = comps.find((x) => x.types?.includes(type));
  if (!c) return null;
  return (kind === "short" ? c.shortText : c.longText) || null;
};

// The components array flattened into the postal patch a create would send.
// Google returns a street number and a route as separate rows and no line_1 at
// all, which is why this mapping has to exist somewhere - it may as well be
// beside the request that produced it.
export async function lookup(place_id: string): Promise<PlaceLookup> {
  const place = await ask<{
    formattedAddress?: string; addressComponents?: Component[]; location?: LatLng;
  }>(
    `/v1/places/${encodeURIComponent(place_id)}`,
    undefined,
    "formattedAddress,addressComponents,location"
  );
  const comps = place.addressComponents ?? [];
  const line_1 = [
    component(comps, "street_number", "short"),
    component(comps, "route", "short"),
  ].filter(Boolean).join(" ");

  return {
    line_1: line_1 || null,
    line_2: null,
    city:
      component(comps, "locality", "long") ??
      component(comps, "sublocality", "long") ??
      component(comps, "postal_town", "long"),
    state: component(comps, "administrative_area_level_1", "short"),
    zip: component(comps, "postal_code", "short"),
    country: component(comps, "country", "long"),
    country_code: component(comps, "country", "short"),
    phone_number: null,
    formatted_address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  };
}
