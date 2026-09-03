import { z } from "zod/v4";
import { ItemsRow, OrdersRow } from "../generated/orders.js";

// THE REQUEST BODIES OF THE ADMIN ORDER PATCH SURFACE (D87's consolidation).
//
// Everything else in wire/ describes what the API RETURNS. These six describe
// what it ACCEPTS, and they are here for the same reason: each was declared
// twice - once in api/features, once in frontend/features - with nothing
// between them, and four of the six had already drifted. The drift was not
// cosmetic. On five fields the API's type said `number | null` and the
// frontend's said `number`, so the API advertised a CLEAR that the only client
// that exists could not compile a call to.
//
// THE THREE-WAY DISTINCTION IS THE WHOLE POINT AND IT IS PRESERVED (D182).
// A patch body is a document naming the fields to write, so every field means
// one of three things and a schema that collapses them is wrong:
//
//   ABSENT   the field is not named; leave the stored value alone
//   null     the field is named with no value; CLEAR the stored value
//   a value  write it
//
// So `.optional()` alone is absent-or-value, and `.nullable().optional()` is
// all three. Which of the two a field gets is a DECISION about whether
// clearing it means anything, taken per field and recorded at the field.
//
// THESE ARE VALIDATION SCHEMAS, NOT PARSERS THE SERVER READS THROUGH. Each
// service refuses an unknown field BY NAME before it gets here (zod strips
// unknown keys rather than rejecting them, which would turn a typo'd field
// into a silent no-op) and then passes the ORIGINAL body downstream, never
// `parsed.data`. The schema's job is to say which values are acceptable; the
// service's `refusedField` remains the gate.

// ===========================================================================
// PATCH /api/orders/:id   - THE ORDER ROW'S OWN FIELDS, AND ONLY THOSE
// ===========================================================================

// FOUR OPERATIONS LEFT THIS DOCUMENT ON 2026-09-03 (D214 item 11). It used to
// carry `add_funds: true`, `finalize_pricing: true`, `cancel: {...}` and
// `supplier: {...}` - none of which is a field of an order. Each was an ACTION
// multiplexed through a PATCH body, which is why the service needed a
// direction matrix, four bespoke refusal messages and a dispatcher; each is
// now `POST /api/orders/:id/<action>` with its own contract in wire/orders.ts.
//
// What remains is what a PATCH is for: columns of orders.orders, taken from
// the generated row so the type cannot drift from the table. `status` is a
// pure customer-facing label driving no logic (ruling 2); `notes` is free
// text. Both are nullable in the table, so an explicit null CLEARS and an
// absent key leaves the column alone - exactly what buildUpdate does with it.
export const OrderPatch = OrdersRow.pick({
  status: true,
  notes: true,
}).partial().strict();
export type OrderPatch = z.infer<typeof OrderPatch>;

// ===========================================================================
// PATCH /api/orders/items/:id
// ===========================================================================

// ONE ROW, ONE PATCH (Jacob, 2026-09-03, reading edit-line.ts: the scrap /
// bullion split "is the old drawer document"). The body used to be
// `{ scrap: { premium, scrap: Record<string, unknown> }, bullion: { quantity,
// premium }, confirmed, reset }` - two nested documents for ONE table, read
// through casts, with every field re-spelled with `?? null` on the way to the
// column it came from.
//
// It is the LINE's own columns now, picked from the generated row:
//
//   ABSENT   leave the column alone
//   null     clear it
//   a value  write it
//
// which is buildUpdate's contract, so the `?? null` full-replace defence is
// not needed - a caller that means "clear the post-melt weight" sends
// `post_melt: null` and says so.
//
// THREE COLUMNS ARE DELIBERATELY NOT HERE. `content` is DERIVED from the
// weight, the unit and the purity by rules.lineContent - two definitions of
// what content means is the defect that costs money. `price` is written by
// finalize-pricing from the frozen spots. `bullion_id` / `metal_id` /
// `order_id` are the line's identity, not its facts.
//
// The refiner's assay numbers (`purity_actual`, `post_melt_actual`) are NOT
// here either: they are refiners.items, and they have their own patch on the
// refiner route - RefinerItemPatch below.
export const OrderItemPatch = ItemsRow.pick({
  pre_melt: true,
  post_melt: true,
  purity: true,
  premium: true,
  quantity: true,
  confirmed: true,
  unit: true,
}).partial().strict();
export type OrderItemPatch = z.infer<typeof OrderItemPatch>;

// ===========================================================================
// PATCH /api/shipments/:id
// ===========================================================================

// The shipment's money and its tracking pair.
//
// `shipping_charge` IS NOT NULLABLE, and this is one of the five decisions the
// drift forced. The API's type said `number | null`; nothing below it agreed.
// editShippingCharge takes `shipping_charge: number` and the patch service
// reached it through `as number`, so the null was a cast, not a capability.
// And a cleared charge would be indistinguishable from a zero one: every
// consumer reads `?? 0`, so null and 0 price identically. A stored fee is a
// record (D117) - "free" is 0, and there is no third state to express.
//
// `tracking_number` and `carrier_id` travel together; the service refuses half
// a pair by name.
export const ShipmentPatch = z.object({
  shipping_charge: z.number().optional(),
  shipping_actual: z.number().optional(),
  tracking_number: z.string().optional(),
  carrier_id: z.string().uuid().optional(),
});
export type ShipmentPatch = z.infer<typeof ShipmentPatch>;

// ===========================================================================
// PATCH /api/refiners/orders/:id   - the ENGAGEMENT (refiners.orders)
// ===========================================================================

// A refiner spot write: which metal, at what bid.
export const RefinerSpotWrite = z.object({
  name: z.string(),
  bid: z.number(),
});
export type RefinerSpotWrite = z.infer<typeof RefinerSpotWrite>;

// The engagement's writable facts, and the file where the null question
// splits. Four of these five fields refuse null and the fifth keeps it,
// because they are not the same kind of value.
//
// THE THREE NUMBERS AND THE FEE REFUSE NULL, for the reason shipping_charge
// does: their exchange shadows - updatePoolOzDeducted, updatePoolRemediation,
// updateRefinerFee - are each typed `number`, the patch service reached them
// through `as number`, and every reader defaults them to 0. Clearing a pool
// deduction and setting it to 0 are the same order.
//
// `refiner_id` KEEPS NULL, and it is a different kind of field: a nullable
// foreign key, not a fee. Every engagement starts with it null - ensureForOrder
// inserts `(order_id)` and nothing else - so null is the column's own "no
// refinery yet", not an erasure of a record. Detaching an engagement from a
// refinery is a real operation (the metal went to the wrong one), the repo's
// setEngagementValue already admits null, and there is no exchange shadow to
// disagree: exchange never recorded which refinery had the metal. Here the
// FRONTEND was the side that was wrong.
export const RefinerOrderPatch = z.object({
  spots: z.array(RefinerSpotWrite).min(1).optional(),
  pool_oz_deducted: z.number().optional(),
  pool_remediation: z.number().optional(),
  fee: z.number().optional(),
  refiner_id: z.string().uuid().nullable().optional(),
});
export type RefinerOrderPatch = z.infer<typeof RefinerOrderPatch>;

// ===========================================================================
// PATCH /api/refiners/items/by-order-item/:orderItemId
// ===========================================================================

// The refinery's report on one customer line. EVERY FIELD IS NULLABLE HERE and
// that is not an oversight: an assay figure that is not yet known is null, the
// admin drawer clears an input to exactly that, and the service reads the
// current row and merges the document over it, so a null means "not measured"
// rather than "leave alone". This is what a genuine clear looks like, and it
// is why the four refused above are refused on their own facts rather than by
// a rule about nulls.
//
// `content` is DELIBERATELY not a field: it is derived from post_melt (or
// pre_melt) and purity, and the service refuses a raw override by name.
export const RefinerItemPatch = z.object({
  premium: z.number().nullable().optional(),
  pre_melt: z.number().nullable().optional(),
  post_melt: z.number().nullable().optional(),
  purity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});
export type RefinerItemPatch = z.infer<typeof RefinerItemPatch>;

// ===========================================================================
// PATCH /api/payouts/:id
// ===========================================================================

// The payout's own writable facts - never the bank details, which have their
// own admin-only read and no write surface at all.
//
// `cost` IS THE PER-ORDER FEE, and it is the answer to half of what production
// shows. features/payouts/constants.ts is a table of DEFAULTS for a new order;
// four of the 62 production payouts disagree with it, and they disagree in two
// directions - two WIRE rows at 0 against a 20 default (waivers) and two ECHECK
// rows at 75 and 125 against a 0 default (charges). A boolean cannot express a
// charge, so the fee has to be per-order data, which `cost` already is.
//
// `waive_payout_fee` IS THE OTHER HALF, and it does NOT overwrite `cost`
// (D117: a stored fee is a record and must never be re-derived). Waiving sets
// the flag; the EFFECTIVE fee the order prices at becomes 0 while the stored
// fee keeps what it would have been, so un-waiving does not have to guess.
// The flag's column is orders.transactions.waive_payout_fee, read back off
// the order wire as `order.totals.waive_payout_fee`.
export const PayoutPatch = z.object({
  cost: z.number().optional(),
  method: z.string().optional(),
  waive_payout_fee: z.boolean().optional(),
});
export type PayoutPatch = z.infer<typeof PayoutPatch>;
