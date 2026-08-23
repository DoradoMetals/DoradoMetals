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

export const PayoutSlotOnOrder = PayoutOnOrder.extend({
  id: z.string().uuid().nullable(),
});
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
// features/purchase-orders/utils/calculations.js.
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
  offer_status: z.string().nullable(),
  offer_notes: z.string().nullable(),
  offer_sent_at: z.string().nullable(),
  offer_expires_at: z.string().nullable(),
  num_rejections: z.number().nullable(),
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
  pool_remediation: z.number(),
  pool_oz_deducted: z.number(),
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
