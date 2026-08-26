// Which provider implements each carrier.
//
// Keyed by the carrier's organization name, lowercased - see resolver.ts, which
// is what turns a carrier_id into one of these keys. The commented-out entries
// are the shape a second carrier would take rather than aspiration: adding UPS
// means a providers/ups/ups.js exporting the same functions, an entry here and
// an entry in BUILDERS, and nothing else changes.
import * as fedex from "#providers/fedex/fedex.ts";
// import * as ups from "#providers/ups/ups.js";
// import * as usps from "#providers/usps/usps.js";

// Deliberately not typed as a Record<string, SomeProviderInterface>. There is
// one provider, and writing an interface now would describe FedEx's shape and
// call it the general case - the second carrier is what tells you which parts
// were general. Until then this is a lookup table whose values are modules.
export const PROVIDERS = {
  fedex,
  // ups,
  // usps,
};
