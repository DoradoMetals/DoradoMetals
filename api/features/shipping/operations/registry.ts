// Which provider implements each carrier.
//
// Keyed by the carrier's organization name, lowercased - see resolver.ts, which
// is what turns a carrier_id into one of these keys. The commented-out entries
// are the shape a second carrier would take rather than aspiration: adding UPS
// means a providers/shipments/ups.ts exporting the same functions, an entry here and
// an entry in BUILDERS, and nothing else changes.
import * as fedex from "#providers/shipments/fedex.ts";
// import * as ups from "#providers/shipments/ups.ts";
// import * as usps from "#providers/shipments/usps.ts";

// Deliberately not typed as a Record<string, SomeProviderInterface>. There is
// one provider, and writing an interface now would describe FedEx's shape and
// call it the general case - the second carrier is what tells you which parts
// were general. Until then this is a lookup table whose values are modules.
export const PROVIDERS = {
  fedex,
  // ups,
  // usps,
};
