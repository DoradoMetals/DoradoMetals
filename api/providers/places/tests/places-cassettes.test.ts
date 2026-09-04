// THE PLACES PROVIDER AGAINST A RECORDED ANSWER.
//
// *** THIS CASSETTE IS HAND-AUTHORED, AND THAT IS DELIBERATE. *** Every other
// cassette in tests/cassettes was recorded with RECORD_CASSETTES=1 against a
// real sandbox. Google Places has no sandbox: the only way to record one is to
// send a live, BILLED request with a real key, and the lane that added this was
// told never to use live keys in a test. So the fixture is written from
// Google's documented Places API (New) response shapes and holds no key, no
// place id and no real address - which costs the one thing a recording buys
// (proof the shape is really Google's) and keeps everything else a cassette is
// for: the request this adapter builds, the mapping of the answer, and the
// certainty that no test reaches the network.
//
// The three suggestions in it are the three cases the browser's own parser had
// to handle and the two it silently dropped: a full structuredFormat, a
// prediction with only `text`, and one with no place id at all.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as provider from "#providers/places/google.ts";

const KEY = "GOOGLE_PLACES_API_KEY";
let previous: string | undefined;

beforeAll(() => {
  // The header is never recorded (enable_reqheaders_recording: false), so the
  // value is irrelevant - but requiredEnv refuses without one, and refusing is
  // what it should do.
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
  // No structuredFormat at all: the full text is the main line and there is no
  // second one. `null`, never an empty string - absent is absent.
  assert.deepEqual(out[1], {
    place_id: "SCRUBBED_PLACE_ID_2",
    main: "6100 Main Street, Houston, TX 77005, USA",
    secondary: null,
  });
});

// GOOGLE HAS NO line_1. It returns a street number and a route as separate
// components, which is the whole reason this mapping has to exist somewhere.
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
