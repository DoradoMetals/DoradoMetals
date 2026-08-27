// Turning a Google Places result into an address the business will ship to.
//
// This is the only path by which a customer's address enters checkout without
// being typed field by field, and its output feeds two gates: `is_valid`, which
// `useGetRatesInput` refuses to quote without, and `country`, which decides
// whether a FedEx label is domestic. Both are set here as constants rather than
// read from the place, so they are pinned deliberately below.
import { describe, expect, test } from "vitest";
import {
  formatAddressSearchText,
  placeToAddressFields,
  parsePlacesJsAutocomplete,
} from "@/features/addresses/utils/places";
import type { PlacesJsSuggestion } from "@/features/addresses/types";

const comp = (types: string[], shortText: string, longText = shortText) =>
  ({ types, shortText, longText }) as never;

const place = (components: unknown[]) =>
  ({ addressComponents: components }) as google.maps.places.Place;

const fullPlace = () =>
  place([
    comp(["street_number"], "1600"),
    comp(["route"], "Pennsylvania Ave NW"),
    comp(["locality"], "Washington"),
    comp(["administrative_area_level_1"], "DC", "District of Columbia"),
    comp(["postal_code"], "20500"),
  ]);

describe("the search text sent to Places", () => {
  test("joins the parts that are present, with commas", () => {
    expect(
      formatAddressSearchText({ line_1: "1 Main St", city: "Austin", state: "TX", zip: "78701" })
    ).toBe("1 Main St, Austin, TX 78701");
  });

  test("omits a missing city, state and zip rather than leaving stray commas", () => {
    expect(formatAddressSearchText({ line_1: "1 Main St" })).toBe("1 Main St");
  });

  test("an empty or absent address is the empty string, not 'undefined'", () => {
    expect(formatAddressSearchText()).toBe("");
    expect(formatAddressSearchText({})).toBe("");
  });

  test("the zip is separated by a space, the rest by commas", () => {
    expect(formatAddressSearchText({ city: "Austin", state: "TX", zip: "78701" })).toBe(
      ", Austin, TX 78701"
    );
  });
});

describe("a Places result becomes address fields", () => {
  test("street number and route join into line_1", () => {
    expect(placeToAddressFields(fullPlace())?.line_1).toBe("1600 Pennsylvania Ave NW");
  });

  test("the state is the SHORT name and the city the LONG one", () => {
    const got = placeToAddressFields(fullPlace());
    expect(got?.state).toBe("DC");
    expect(got?.city).toBe("Washington");
  });

  test("a place with no components at all is refused with null", () => {
    expect(placeToAddressFields(place([]))).toBeNull();
  });

  test("city falls back from locality to sublocality to postal_town", () => {
    const viaSub = place([comp(["sublocality"], "Brooklyn"), comp(["postal_code"], "11201")]);
    expect(placeToAddressFields(viaSub)?.city).toBe("Brooklyn");

    const viaTown = place([comp(["postal_town"], "Reading"), comp(["postal_code"], "RG1")]);
    expect(placeToAddressFields(viaTown)?.city).toBe("Reading");
  });
});

// ---------------------------------------------------------------------------
// PINNED DELIBERATELY. Both of these are constants in the function, not values
// read from the place, and both feed a gate elsewhere:
//
//   is_valid: true  - `useGetRatesInput` returns null (no quote) unless the
//                     address is_valid, so anything from Places passes that
//                     gate by construction, including the case below where the
//                     street line came back empty.
//   country: 'United States' - decides whether a FedEx label is domestic.
//
// Stated here so that changing either is a visible decision rather than a
// silent one. Not called defects: restricting Places to US results upstream
// would make both correct, and I cannot see that configuration from here.
// ---------------------------------------------------------------------------
describe("is_valid and country are constants, not read from the place", () => {
  test("any parsed place is marked valid", () => {
    expect(placeToAddressFields(fullPlace())?.is_valid).toBe(true);
  });

  test("a place with components but NO street line is still marked valid", () => {
    const noStreet = place([comp(["locality"], "Austin"), comp(["postal_code"], "78701")]);
    const got = placeToAddressFields(noStreet);
    expect(got?.line_1).toBe("");
    expect(got?.is_valid).toBe(true);
  });

  test("country is United States even when the place plainly is not", () => {
    const toronto = place([
      comp(["street_number"], "290"),
      comp(["route"], "Bremner Blvd"),
      comp(["locality"], "Toronto"),
      comp(["administrative_area_level_1"], "ON", "Ontario"),
      comp(["postal_code"], "M5V 3L9"),
      comp(["country"], "CA", "Canada"),
    ]);
    expect(placeToAddressFields(toronto)?.country).toBe("United States");
  });
});

describe("autocomplete suggestions", () => {
  const suggestion = (over: Record<string, unknown> = {}) =>
    ({
      placePrediction: {
        placeId: "abc",
        structuredFormat: { mainText: { text: "1 Main St" }, secondaryText: { text: "Austin, TX" } },
        text: { text: "1 Main St, Austin, TX" },
        ...over,
      },
    }) as PlacesJsSuggestion;

  test("a suggestion keeps its id, main and secondary text", () => {
    const [got] = parsePlacesJsAutocomplete([suggestion()]);
    expect(got.placeId).toBe("abc");
    expect(got.main).toBe("1 Main St");
    expect(got.secondary).toBe("Austin, TX");
  });

  test("a secondary given as a bare string is accepted too", () => {
    const [got] = parsePlacesJsAutocomplete([
      suggestion({ structuredFormat: { mainText: { text: "1 Main St" }, secondaryText: "Austin, TX" } }),
    ]);
    expect(got.secondary).toBe("Austin, TX");
  });

  test("a suggestion with no placeId is dropped, not returned half-built", () => {
    expect(parsePlacesJsAutocomplete([suggestion({ placeId: "" })])).toEqual([]);
  });

  test("a suggestion with no main text is dropped", () => {
    const blank = suggestion({ structuredFormat: undefined, text: undefined });
    expect(parsePlacesJsAutocomplete([blank])).toEqual([]);
  });

  test("an empty or absent list is an empty array rather than a throw", () => {
    expect(parsePlacesJsAutocomplete([])).toEqual([]);
    expect(parsePlacesJsAutocomplete(undefined as never)).toEqual([]);
  });

  test("a good suggestion survives alongside a dropped one", () => {
    const got = parsePlacesJsAutocomplete([suggestion({ placeId: "" }), suggestion()]);
    expect(got).toHaveLength(1);
    expect(got[0].placeId).toBe("abc");
  });
});
