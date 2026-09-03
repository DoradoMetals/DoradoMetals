// What each carrier calls its own services and its own handoff options - keyed like PROVIDERS/BUILDERS, for the same reason: resolveCarrier looks up all three, so a missing entry is an error at the call, not a silent gap.
// PROVIDERS is how we talk to a carrier, BUILDERS is how we shape a request, this is what it calls things.
import { CATALOGUE as fedexCatalogue } from "#domain/shipping/operations/adapters/fedex.catalogue.ts";

export const CATALOGUES = {
  fedex: fedexCatalogue,
};
