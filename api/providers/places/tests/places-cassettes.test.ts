import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as provider from "#providers/places/google.ts";

const KEY = "GOOGLE_PLACES_API_KEY";
let previous: string | undefined;

beforeAll(() => {
  previous = process.env[KEY];
  process.env[KEY] = "not-a-real-key";
});

afterAll(() => {
  if (previous === undefined) delete process.env[KEY];
  else process.env[KEY] = previous;
});

test("a suggestion keeps one string per half, and a prediction with no id is dropped", async () => {
  const out = await withCassette("places/autocomplete-and-lookup.json", () =>
    provider.suggest("6100 Main St Houston", "SCRUBBED_SESSION_ID")
  );

  assert.equal(out.length, 2, "the prediction with no place id reached a caller");
  assert.deepEqual(out[0], {
    place_id: "SCRUBBED_PLACE_ID",
    main: "6100 Main St",
    secondary: "Houston, TX, USA",
  });
  assert.deepEqual(out[1], {
    place_id: "SCRUBBED_PLACE_ID_2",
    main: "6100 Main Street, Houston, TX 77005, USA",
    secondary: null,
  });
});

test("a lookup flattens the components into the patch a create would send", async () => {
  const out = await withCassette("places/autocomplete-and-lookup.json", () =>
    provider.lookup("SCRUBBED_PLACE_ID")
  );

  assert.deepEqual(out, {
    line_1: "6100 Main St",
    line_2: null,
    city: "Houston",
    state: "TX",
    zip: "77005",
    country: "United States",
    country_code: "US",
    phone_number: null,
    formatted_address: "6100 Main St, Houston, TX 77005, USA",
    latitude: 29.717,
    longitude: -95.4018,
  });
});
