import { z } from "zod/v4";
import { PayoutOnOrder } from "./payouts.js";
import { ShipmentOnOrder, CarrierPickup } from "./shipping.js";
import { UserOnOrder } from "./users.js";

// What an order looks like on the wire.
//
// Orders had no contract at all, which made them the largest gap in
// validate:wire - three nested pieces (payout, shipment, user) were checked and
// the order around them was not, nor were its items. It also meant orders were
// the one feature validated against `exchange` only: everything else goes
// through bothWays and proves repo.next returns the same shape.
//
// That matters more here than anywhere else. `diff` proves the two
// implementations agree with each other, so if both drift from what the
// frontend expects it stays green. A contract is the independent statement of
// what the shape has to be, and it is what has to survive promotion.
//
// THE SHAPE IS THE CONVERTED ONE (D84, 2026-08-28), decided against the schema
// rather than the old wire:
//   - `number` and `status` take the orders.orders names; direction is the
//     endpoint's, not a field the frontend switches on.
//   - Money nests as `totals` with orders.transactions' own names - the
//     payments precedent: what-was-asked keeps its own object.
//   - The address is a SNAPSHOT, per Jacob: immutable postal facts plus the
//     recipient - address_id is the BOOK id (source_address_id) because
//     checkout resolves against the book, and recipient_name says what the
//     old smeared `name` actually meant on an order. No user_address, no
//     is_default: a snapshot is neither a place nor a relationship, it is
//     where a shipment went and who receives it.
//   - Embedded products and spots speak the converted names
//     (name/description/type, name/ask/bid) - the seam trio died with this.
//
// The legacy family (AddressOnOrder, PurchaseOrderWire / SalesOrderWire and
// their item shapes, order_number / *_status / flat money) lived here until
// 2026-08-28, when the orders wire converted and the last consumer moved. The
// -WireNext suffixes retired with it: one shape, one name.
//
// Timestamps are strings, not Dates. validate-wire compares
// JSON.parse(JSON.stringify(row)) because that is what the frontend actually
// receives, and serialisation turns every Date into an ISO string.
//
// Nullability is taken from the source columns in production, not from what dev
// happens to hold. Almost everything on an order is nullable in exchange -
// including created_at, updated_at and user_id - and a contract that declared
// otherwise would pass here and fail on the first real order.

// An order that has no shipment still carries a shipment object - the repo
// builds one with every field null rather than returning null. So "no shipment"
// on the wire is `{ id: null, ... }`, which is why every existing check here
// filters on `s?.id` before validating one.
//
// Only the id is relaxed; everything else on ShipmentOnOrder is already
// nullable. Same for the payout, which behaves the same way.
export const ShipmentSlotOnOrder = ShipmentOnOrder.extend({
  id: z.string().uuid().nullable(),
});
export type ShipmentSlotOnOrder = z.infer<typeof ShipmentSlotOnOrder>;

// Partial, then nullable-ised: an order with no payout row carries an OBJECT
// OF NULLS, not a null - jsonb_build_object builds one when its join misses,
// and the frontend reads order.payout.method without optional chaining, so the
// all-null object is the wire shape. Five dev orders and the six strays are in
// that state today. The contract describes the wire, not exchange.payouts'
// NOT NULLs - those are D63's business.
export const PayoutSlotOnOrder = z.object(
  Object.fromEntries(
    Object.entries(PayoutOnOrder.extend({ id: z.string().uuid().nullable() }).shape)
      .map(([k, v]) => [k, (v as z.ZodTypeAny).nullable()])
  )
) as unknown as z.ZodObject<{ [K in keyof typeof PayoutOnOrder.shape]: z.ZodNullable<z.ZodTypeAny> }>;
export type PayoutSlotOnOrder = z.infer<typeof PayoutSlotOnOrder>;

// The scrap an item was declared as. Every purchase-order item carries this
// object whether or not it is scrap; for a bullion line every field is null.
// The assay columns are admin-only - getAll passes withActuals and the
// customer-facing reads do not - so they are absent rather than null there.
export const ScrapOnOrderItem = z.object({
  id: z.string().uuid().nullable(),
  metal: z.string().nullable(),
  pre_melt: z.number().nullable(),
  post_melt: z.number().nullable(),
  purity: z.number().nullable(),
  content: z.number().nullable(),
  gross_unit: z.string().nullable(),
  bid_premium: z.number().nullable(),
  purity_actual: z.number().nullable().optional(),
  post_melt_actual: z.number().nullable().optional(),
  content_actual: z.number().nullable().optional(),
  name: z.string().nullable().optional(), // assigned for display, not stored
});
export type ScrapOnOrderItem = z.infer<typeof ScrapOnOrderItem>;

// The product summary carried on an item - not the full catalogue row, and
// null when the line is scrap. Speaks the converted names: name / description
// / type, the way the catalogue (Bullion) does. The legacy shape of the same
// name - product_name / product_type, an object of nulls on scrap lines -
// retired 2026-08-28 with the orders wire conversion.
export const ProductOnOrderItem = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  type: z.string().nullable(),
  metal_type: z.string().nullable(),
  content: z.number().nullable(),
  gross: z.number().nullable(),
  purity: z.number().nullable(),
  bid_premium: z.number().nullable(),
  ask_premium: z.number().nullable(),
  image_front: z.string().nullable(),
  image_back: z.string().nullable(),
  mint_name: z.string().nullable(),
});
export type ProductOnOrderItem = z.infer<typeof ProductOnOrderItem>;

// A spot as it appears on an order - the order's locked (or live) prices per
// metal, speaking the converted names: name / ask / bid, never type /
// ask_spot / bid_spot.
export const SpotOnOrder = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  ask: z.number().nullable(),
  bid: z.number().nullable(),
  percent_change: z.number().nullable(),
  dollar_change: z.number().nullable(),
});
export type SpotOnOrder = z.infer<typeof SpotOnOrder>;

// item_type is not a column. The repo derives it from which of scrap_id or
// product_id the row carries, and the pricing code branches on it - see
// features/purchase-orders/utils/calculations.ts.
export const PurchaseOrderItem = z.object({
  id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable(),
  item_type: z.enum(["scrap", "product"]),
  price: z.number().nullable(),
  premium: z.number().nullable(),
  quantity: z.number().nullable(),
  confirmed: z.boolean(),
  refiner_premium: z.number().nullable().optional(),
  scrap: ScrapOnOrderItem,
  product: ProductOnOrderItem.nullable(),
});
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItem>;

// A sales-order line is always a product, so it carries no scrap object and no
// item_type to tell them apart.
export const SalesOrderItem = z.object({
  id: z.string().uuid(),
  sales_order_id: z.string().uuid().nullable(),
  price: z.number().nullable(),
  premium: z.number().nullable(),
  quantity: z.number().nullable(),
  product: ProductOnOrderItem.nullable(),
});
export type SalesOrderItem = z.infer<typeof SalesOrderItem>;

// The address as it appears on an order: a SNAPSHOT. address_id is the BOOK id
// (source_address_id) - checkout resolves against the book - and
// recipient_name is who receives the shipment, which is what the old smeared
// `name` always meant here. No user_address and no is_default: a snapshot is
// neither a place nor a relationship.
export const OrderAddressSnapshot = z.object({
  address_id: z.string().uuid().nullable(),
  recipient_name: z.string().nullable(),
  line_1: z.string().nullable(),
  line_2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  country_code: z.string().nullable(),
  zip: z.string().nullable(),
  phone_number: z.string().nullable(),
  is_residential: z.boolean().nullable(),
  is_valid: z.boolean().nullable(),
});
export type OrderAddressSnapshot = z.infer<typeof OrderAddressSnapshot>;

// The money, nested under orders.transactions' own names. funds IS
// transactions.funds (the legacy compose undid that rename as
// pre_charges_amount); a SALES order's refiner_fee is deliberately NULL -
// exchange never had the column, and transactions holds only the default.
export const OrderTotals = z.object({
  total: z.number().nullable(),
  items: z.number().nullable(),
  shipping: z.number().nullable(),
  surcharge: z.number().nullable(),
  sales_tax: z.number().nullable(),
  funds: z.number().nullable(),
  refiner_fee: z.number().nullable(),
  base_total: z.number().nullable(),
  subject_to_charges_amount: z.number().nullable(),
  post_charges_amount: z.number().nullable(),
});
export type OrderTotals = z.infer<typeof OrderTotals>;

export const PurchaseOrder = z.object({
  id: z.string().uuid(),
  number: z.number().nullable(),
  status: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  address_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  shipping_paid: z.boolean().nullable(),
  shipping_fee_actual: z.number().nullable(),
  waive_shipping_fee: z.boolean().nullable(),
  waive_payout_fee: z.boolean().nullable(),
  spots_locked: z.boolean().nullable(),
  review_created: z.boolean().nullable(),
  // Not nullable in exchange, unlike almost everything else on this table.
  // Null on the six new-schema-only stray orders, whose transactions row does
  // not exist; numbers everywhere else. Nullable until clean:dual-orphans runs.
  pool_remediation: z.number().nullable(),
  pool_oz_deducted: z.number().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),

  totals: OrderTotals.nullable(),
  address: OrderAddressSnapshot.nullable(),
  payout: PayoutSlotOnOrder,
  shipment: ShipmentSlotOnOrder,
  return_shipment: ShipmentSlotOnOrder,
  // Empty in dev and in production, so this declaration is a statement about
  // what the shape would be rather than one anything has confirmed.
  carrier_pickup: CarrierPickup.nullable(),
  user: UserOnOrder,
  order_items: z.array(PurchaseOrderItem),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrder>;

export const SalesOrder = z.object({
  id: z.string().uuid(),
  number: z.number().nullable(),
  status: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  address_id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  shipping_service: z.string().nullable(),
  order_sent: z.boolean().nullable(),
  tracking_updated: z.boolean().nullable(),
  review_created: z.boolean().nullable(),
  used_funds: z.boolean(),

  totals: OrderTotals.nullable(),

  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),

  address: OrderAddressSnapshot.nullable(),
  shipment: ShipmentSlotOnOrder,
  user: UserOnOrder,
  order_items: z.array(SalesOrderItem),
});
export type SalesOrder = z.infer<typeof SalesOrder>;
