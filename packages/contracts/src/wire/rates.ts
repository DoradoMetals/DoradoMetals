import { z } from "zod/v4";
import { RatesRow } from "../generated/exchange.js";
import { RatesRow as LiveRatesRow } from "../generated/rates.js";

// GET /rates/get_all. The query joins metals and returns the metal's name in
// place of its id, and drops the audit columns.
//
// Rate/AdminRate stay sourced from exchange's RatesRow: resolveRate.ts's
// TaxableFacts-adjacent callers (domain/orders/edit-line.ts, domain/quotes/
// service.ts) are typed against this exact shape and are out of this pass's
// scope. RateInput/RatePatch below switch to the live `rates` schema, which
// is what api/db/rates/repo.ts actually writes - a write body has no such
// downstream coupling to widen.
export const Rate = RatesRow.omit({
  metal_id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
}).extend({
  metal: z.string(),
});
export type Rate = z.infer<typeof Rate>;

// GET /rates/get_admin, and what the create/update endpoints answer with.
//
// THE SECOND SHAPE THIS ENDPOINT HAS ALWAYS SERVED, and it had no contract
// until phase 3 - api/features/rates/wire.ts declares `AdminRateWire` beside
// `RateWire` and says in its own header that "getAllRates historically omitted
// the audit columns and getAdminRates included them". The frontend covered the
// gap with ONE hand-written type carrying the union of both, `metal_id` and
// `unit` optional so it could stand in for either, which is how a shape stops
// describing anything: the admin card reads `metal_id` off a value whose type
// said it might not be there.
export const AdminRate = Rate.extend({
  metal_id: RatesRow.shape.metal_id,
  created_at: RatesRow.shape.created_at,
  updated_at: RatesRow.shape.updated_at,
  created_by: RatesRow.shape.created_by,
  updated_by: RatesRow.shape.updated_by,
});
export type AdminRate = z.infer<typeof AdminRate>;

// POST /rates/create and /rates/update - the columns a caller may write.
// Mirrors api/db/rates/repo.ts's `NewRate`/`RatePatch`: the six writable
// columns and nothing else. `created_by`/`updated_by` are NOT fields here
// (item 4): public.audit_stamp writes both from the connection's actor
// (migration 116), and rates.rates' create/update statements never took them
// as parameters in the first place. The METAL travels as `metal_id` here and
// as `metal` (the name) on the way back, which is the one asymmetry in this
// feature and is now stated in the shapes rather than inferred from a form.
export const RateInput = LiveRatesRow.pick({
  metal_id: true,
  unit: true,
  min_qty: true,
  max_qty: true,
  scrap_pct: true,
  bullion_pct: true,
});
export type RateInput = z.infer<typeof RateInput>;
export const RatePatch = RateInput.partial();
export type RatePatch = z.infer<typeof RatePatch>;
