import type { CarrierRead, CarrierServiceRead } from '@dorado/contracts'

// FOURTH CONVERTED FEATURE (2026-08-27), the first STRUCTURAL one. A carrier
// is an organization with a role, and the converted shape keeps them apart:
// the identity fields live under `organization` (with `enabled` where the
// flat shape said `is_active`), the carrier's own row keeps id / logo /
// timestamps. The old flat Carrier was the lift adapter's output; the adapter
// is gone.
export type Carrier = CarrierRead

// A CARRIER'S SERVICE, FROM THE CONTRACTS (phase 3, ruling 39). This was
// twenty-four fields transcribed by hand, ALL of them required, against a
// wire where every one except id / carrier_id / name is NULLABLE - and with
// the timestamps typed `Date` where the wire sends strings. The contract's
// `CarrierService` is `CarrierServicesRow`, and the API's read projects
// shipping.services aliased back to exactly those names on purpose
// (get_all.sql's header says why), so the two now agree by construction
// rather than by inspection.
export type CarrierService = CarrierServiceRead

// THE CREATE BODY, AND IT STAYS HERE. The API's own input type
// (api/features/shipping/services/service.ts `ServiceInput`) is
// all-optional-and-untrusted because it IS req.body, with a `flag()` helper
// beside it that distinguishes `false` from absent. This is not that shape:
// it is what THE ADD BUTTON SENDS, two required fields, and typing it as the
// server's permissive input would let a call site omit the name. Ruling 37's
// half of this - one input schema both sides import - needs the API to adopt
// it in the same change, and api/features is another lane's this wave.
export interface NewCarrierService {
  carrier_id: string
  name: string
}
