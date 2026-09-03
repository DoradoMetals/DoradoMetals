// Which provider implements each carrier, keyed by the carrier's organization name, lowercased (see resolver.ts).
// The commented-out entries show the shape a second carrier takes, not aspiration: add a providers/shipments/ups.ts, an entry here, an entry in BUILDERS - nothing else changes.
import * as fedex from "#providers/shipments/fedex.ts";
// import * as ups from "#providers/shipments/ups.ts";
// import * as usps from "#providers/shipments/usps.ts";

// Deliberately untyped as Record<string, SomeProviderInterface>: with one provider, an interface now would just describe FedEx's shape and call it general - the second carrier is what reveals which parts really are.
export const PROVIDERS = {
  fedex,
  // ups,
  // usps,
};
