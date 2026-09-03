import { z } from "zod/v4";

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
// PATCH /api/orders/:id
// ===========================================================================

// The order document. Its fields are OPERATIONS, not columns - except
// `status`, which is a pure customer-facing label driving no logic (ruling 2).
// The service validates each against the order's DIRECTION: add_funds,
// finalize_pricing and cancel are purchase-side, supplier is sale-side.
//
// `cancel.return_shipment` is an opaque object here because it is opaque to
// the API too: patchOrder hands it straight to the cancel pipeline, which
// buys the FedEx return label from it. Narrowing it in this package would
// mean importing the frontend's package/pickup/service/insurance form schemas,
// which are UI policy and deliberately not table-derived. The client's record
// of the shape stays in frontend/features/orders/patch.ts.
export const OrderPatch = z.object({
  // Both of these are the operation's NAME, not a boolean the caller sets
  // either way: the service has always refused anything but `true` and its
  // message says so ("send true or omit it"). The API's own type said
  // `boolean` while its runtime said `true`; the runtime was right.
  finalize_pricing: z.literal(true).optional(),
  add_funds: z.literal(true).optional(),
  cancel: z.object({ return_shipment: z.record(z.string(), z.unknown()) }).optional(),
  // `send: true` is required rather than implied: attaching a refiner WITHOUT
  // sending them the order is not an operation this endpoint has.
  supplier: z.object({ supplier_id: z.string(), send: z.literal(true) }).optional(),
  status: z.string().optional(),
}).strict();
export type OrderPatch = z.infer<typeof OrderPatch>;

// ===========================================================================
// PATCH /api/orders/items/:id
// ===========================================================================

// The scrap-and-premium edit. BOTH MEMBERS ARE REQUIRED, and that is a
// property of the write rather than a style choice: updateScrapItem sets every
// column it knows in one statement and re-writes the line's premium in the
// same transaction, so a document holding only the changed fields nulls the
// rest. A caller must read the line first and send it back whole.
//
// `scrap` stays an open record. The statement reads pre_melt, post_melt,
// purity, gross_unit, bid_premium and the two *_actual columns off it, and the
// client sends `metal` and `content` besides; pinning the keys here would
// refuse a body that works today for no gain, since nothing reads `parsed.data`.
export const OrderItemScrapPatch = z.object({
  premium: z.number().nullable(),
  scrap: z.record(z.string(), z.unknown()),
});
export type OrderItemScrapPatch = z.infer<typeof OrderItemScrapPatch>;

// Both required for the same reason, and this one is measurable: the exchange
// statement is `SET quantity = $1, premium = $2`, unconditionally. A document
// naming only `premium` sends `undefined` for quantity and pg writes NULL - a
// bullion line silently loses how many of the coin the customer sent.
export const OrderItemBullionPatch = z.object({
  quantity: z.number().nullable(),
  premium: z.number().nullable(),
});
export type OrderItemBullionPatch = z.infer<typeof OrderItemBullionPatch>;

// A line's document. `confirmed` and `reset` are ONE operation under two
// names - confirmed: true saves the line, reset: true unconfirms it - and both
// are literals for the reason finalize_pricing is: the dispatch is
// `body.confirmed === true || body.reset === true`, so `confirmed: false`
// passed the field check, matched no branch, and answered 200 having done
// nothing. A no-op that reports success is worse than a refusal.
export const OrderItemPatch = z.object({
  scrap: OrderItemScrapPatch.optional(),
  bullion: OrderItemBullionPatch.optional(),
  confirmed: z.literal(true).optional(),
  reset: z.literal(true).optional(),
}).strict();
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
