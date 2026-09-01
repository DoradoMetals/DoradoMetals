// SALE DELIVERY TIERS - how fast a sale ships and what the customer pays for
// it (D207). Not a carrier service: a tier has no carrier and no capability
// flags; its price is the checkout's, set by the business, and 109 gave it a
// table after it had lived only in getShippingCharge's constants and two
// hardcoded frontend records.
//
// getShippingCharge (features/pricing/ask.ts) remains the PRICING authority -
// pricing is pure, and stays so. features/pricing/tests/reference-drift pins
// these rows to its constants, so the two sources cannot drift silently; the
// day pricing reads the table itself, the pin comes out.
import * as repo from "#features/shipping/tiers/repo.ts";
import type { TierRow } from "#features/shipping/tiers/repo.ts";

export async function getTiers(): Promise<TierRow[]> {
  return await repo.getAll();
}
