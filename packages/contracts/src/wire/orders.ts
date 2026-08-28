import { z } from "zod/v4";
import { PayoutOnOrder } from "./payouts.js";
import { ShipmentOnOrder, CarrierPickupWire } from "./shipping.js";
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

// The product summary carried on an item - not the full catalogue row. Same
// rule: present on every item, all null when the line is scrap.
export const ProductOnOrderItem = z.object({
  id: z.string().uuid().nullable(),
  product_name: z.string().nullable(),
  product_type: z.string().nullable(),
  metal_type: z.string().nullable(),
  content: z.number().nullable(),
  bid_premium: z.number().nullable(),
  ask_premium: z.number().nullable(),
  image_front: z.string().nullable(),
  image_back: z.string().nullable(),
  shadow_offset: z.number().nullable(),
  variant_group: z.string().nullable(),
});
export type ProductOnOrderItem = z.infer<typeof ProductOnOrderItem>;

// item_type is not a column. The repo derives it from which of scrap_id or
// product_id the row carries, and the pricing code branches on it - see
// features/purchase-orders/utils/calculations.ts.
export const PurchaseOrderItemWire = z.object({
  id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable(),
  item_type: z.enum(["scrap", "product"]),
  price: z.number().nullable(),
  premium: z.number().nullable(),
  quantity: z.number().nullable(),
  confirmed: z.boolean(),
  refiner_premium: z.number().nullable().optional(),
  scrap: ScrapOnOrderItem,
  product: ProductOnOrderItem,
});
export type PurchaseOrderItemWire = z.infer<typeof PurchaseOrderItemWire>;

// A sales-order line is always a product, so it carries no scrap object and no
// item_type to tell them apart.
export const SalesOrderItemWire = z.object({
  id: z.string().uuid(),
  sales_order_id: z.string().uuid().nullable(),
  price: z.number().nullable(),
  premium: z.number().nullable(),
  quantity: z.number().nullable(),
  product: ProductOnOrderItem,
});
export type SalesOrderItemWire = z.infer<typeof SalesOrderItemWire>;

// The address as it appears on an order. Its created_at and updated_at are
// strings where the order's own are Dates - the address arrives through a JSON
// aggregation in SQL and never passes through the timestamp parser. That is not
// a mistake to fix here; changing it is a wire change.
export const AddressOnOrder = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  line_1: z.string().nullable(),
  line_2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().nullable(),
  country_code: z.string().nullable(),
  phone_number: z.string().nullable(),
  is_default: z.boolean().nullable(),
  is_residential: z.boolean().nullable(),
  is_valid: z.boolean().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type AddressOnOrder = z.infer<typeof AddressOnOrder>;

export const PurchaseOrderWire = z.object({
  id: z.string().uuid(),
  order_number: z.number(),
  user_id: z.string().uuid().nullable(),
  address_id: z.string().uuid().nullable(),
  purchase_order_status: z.string().nullable(),
  notes: z.string().nullable(),
  total_price: z.number().nullable(),
  refiner_fee: z.number().nullable(),
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

  address: AddressOnOrder.nullable(),
  payout: PayoutSlotOnOrder,
  shipment: ShipmentSlotOnOrder,
  return_shipment: ShipmentSlotOnOrder,
  // Empty in dev and in production, so this declaration is a statement about
  // what the shape would be rather than one anything has confirmed.
  carrier_pickup: CarrierPickupWire.nullable(),
  user: UserOnOrder,
  order_items: z.array(PurchaseOrderItemWire),
});
export type PurchaseOrderWire = z.infer<typeof PurchaseOrderWire>;

export const SalesOrderWire = z.object({
  id: z.string().uuid(),
  order_number: z.number(),
  user_id: z.string().uuid().nullable(),
  address_id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid().nullable(),
  sales_order_status: z.string().nullable(),
  notes: z.string().nullable(),
  shipping_service: z.string().nullable(),
  order_sent: z.boolean().nullable(),
  tracking_updated: z.boolean().nullable(),
  review_created: z.boolean().nullable(),
  used_funds: z.boolean(),

  // The money. All computed by the repo rather than stored, which is why none
  // of them is nullable.
  base_total: z.number(),
  item_total: z.number(),
  order_total: z.number(),
  shipping_cost: z.number(),
  sales_tax: z.number(),
  charges_amount: z.number(),
  pre_charges_amount: z.number(),
  post_charges_amount: z.number(),
  subject_to_charges_amount: z.number(),

  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),

  address: AddressOnOrder.nullable(),
  shipment: ShipmentSlotOnOrder,
  user: UserOnOrder,
  order_items: z.array(SalesOrderItemWire),
});
export type SalesOrderWire = z.infer<typeof SalesOrderWire>;

// ---------------------------------------------------------------------------
// THE CONVERTED ORDER WIRE (D84, 2026-08-28). Orders never had a *_WIRE
// switch, so these land as ONE deliberate change with the API and frontend
// together. The legacy family above retires when the last consumer moves
// (slice c5), and the -WireNext suffixes go with it.
//
// Shape decisions, made against the schema rather than the old wire:
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
//     (name/description/type, name/ask/bid) - the seam trio dies with this.

export const OrderAddressSnapshotWire = z.object({
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
export type OrderAddressSnapshotWire = z.infer<typeof OrderAddressSnapshotWire>;

export const OrderTotalsWire = z.object({
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
export type OrderTotalsWire = z.infer<typeof OrderTotalsWire>;

export const ProductOnOrderItemNext = z.object({
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
export type ProductOnOrderItemNext = z.infer<typeof ProductOnOrderItemNext>;

export const SpotOnOrderNext = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  ask: z.number().nullable(),
  bid: z.number().nullable(),
  percent_change: z.number().nullable(),
  dollar_change: z.number().nullable(),
});
export type SpotOnOrderNext = z.infer<typeof SpotOnOrderNext>;

export const PurchaseOrderItemWireNext = PurchaseOrderItemWire.omit({
  product: true,
}).extend({
  product: ProductOnOrderItemNext.nullable(),
});
export type PurchaseOrderItemWireNext = z.infer<typeof PurchaseOrderItemWireNext>;

export const SalesOrderItemWireNext = SalesOrderItemWire.omit({
  product: true,
}).extend({
  product: ProductOnOrderItemNext.nullable(),
});
export type SalesOrderItemWireNext = z.infer<typeof SalesOrderItemWireNext>;

export const PurchaseOrderWireNext = PurchaseOrderWire.omit({
  order_number: true,
  purchase_order_status: true,
  total_price: true,
  refiner_fee: true,
  address: true,
  order_items: true,
}).extend({
  number: z.number().nullable(),
  status: z.string().nullable(),
  totals: OrderTotalsWire.nullable(),
  address: OrderAddressSnapshotWire.nullable(),
  order_items: z.array(PurchaseOrderItemWireNext),
});
export type PurchaseOrderWireNext = z.infer<typeof PurchaseOrderWireNext>;

export const SalesOrderWireNext = SalesOrderWire.omit({
  order_number: true,
  sales_order_status: true,
  order_total: true,
  item_total: true,
  shipping_cost: true,
  base_total: true,
  charges_amount: true,
  sales_tax: true,
  pre_charges_amount: true,
  subject_to_charges_amount: true,
  post_charges_amount: true,
  address: true,
  order_items: true,
}).extend({
  number: z.number().nullable(),
  status: z.string().nullable(),
  totals: OrderTotalsWire.nullable(),
  address: OrderAddressSnapshotWire.nullable(),
  order_items: z.array(SalesOrderItemWireNext),
});
export type SalesOrderWireNext = z.infer<typeof SalesOrderWireNext>;

