// What each carrier calls its own services and its own handoff options.
//
// The third map keyed the same way as PROVIDERS in registry.ts and BUILDERS in
// builders.ts, and for the same reason: resolveCarrier looks all three up with
// one key, so a carrier present in one and missing from another is an error at
// the call rather than a silent half-configuration.
//
// PROVIDERS is how we TALK to a carrier, BUILDERS is how we SHAPE a request for
// it, and this is what it CALLS things. The third was living in the browser.
import { CATALOGUE as fedexCatalogue } from "#features/shipping/operations/adapters/fedex.catalogue.ts";

export const CATALOGUES = {
  fedex: fedexCatalogue,
};
