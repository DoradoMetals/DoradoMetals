// A sales order, reassembled from the tables it was split across.
//
// The other half of what orders.orders unifies, and simpler than a purchase
// order: three rows rather than four. It has no OFFER - that is the point of
// keeping offers in their own table rather than as columns null on half the
// rows - no payout, no refiner numbers, and no scrap, because a sale is always
// bullion.
//
// THE COLUMN LIST IS NOT SHARED WITH PURCHASE ORDERS, and features/orders/
// fragments.ts carries a long note about why: extracting the ten identical
// columns reordered the response and `diff` caught it. Ten short lines of
// duplication against a reordered response was the trade, and it was taken
// deliberately.
//
// Still read from exchange, each for its own reason: the customer (auth is
// blocked), the address BOOK row (features/places owns that pivot), and - until
// the shipments call is wired - nothing else.
import type { OrderItemRow } from "#features/orders/items/repo.ts";
import type { OrderTotalsRow } from "#features/orders/transactions/repo.ts";
import type { OrderAddressRow } from "#features/orders/addresses/repo.ts";
import type { ComposedProduct } from "#features/purchase-orders/compose.ts";
import { EMPTY_SHIPMENT, nestShipment } from "#features/purchase-orders/compose.ts";

// The product shape and the shipment nesting are IDENTICAL in both directions,
// so they are imported rather than restated - the same test fragments.ts
// applies: a self-contained value can be shared, an ordered SELECT list cannot.
export type { ComposedProduct } from "#features/purchase-orders/compose.ts";

// A sales-order line. No `scrap` and no `item_type`: a sale is always bullion,
// and the projection never built either.
export type ComposedSalesItem = {
  id: string;
  sales_order_id: string | null;
  price: number | null;
  quantity: number | null;
  premium: number | null;
  product: ComposedProduct;
};

const EMPTY_PRODUCT: ComposedProduct = {
  id: null, product_name: null, content: null, product_type: null,
  image_front: null, image_back: null, bid_premium: null, ask_premium: null,
  variant_group: null, shadow_offset: null, metal_type: null,
};

export function composeItem(
  item: OrderItemRow, products: Map<string, ComposedProduct>
): ComposedSalesItem {
  return {
    id: item.id,
    sales_order_id: item.order_id,
    price: item.price,
    quantity: item.quantity,
    premium: item.premium,
    product:
      item.bullion_id === null
        ? EMPTY_PRODUCT
        : (products.get(item.bullion_id) ?? EMPTY_PRODUCT),
  };
}

export type SalesOrderParts = {
  order: {
    id: string;
    user_id: string | null;
    status: string | null;
    notes: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    created_by: string | null;
    updated_by: string | null;
    number: number | null;
    review_created: boolean | null;
    order_sent: boolean | null;
    tracking_updated: boolean | null;
    refinery_id: string | null;
  };
  totals?: OrderTotalsRow;
  addressLink?: OrderAddressRow;
  items: ComposedSalesItem[];
  address: unknown;
  shipment: Record<string, unknown> | null;
  user: { user_id: string | null; user_name: string | null; user_email: string | null };
};

// The twenty-four columns exchange.sales_orders had, in the order the
// projection listed them. FIVE ARE RENAMED on the way out of
// orders.transactions and the mapping is stated in sql/create_totals.sql too,
// so the read and the write cannot drift apart silently:
//
//   total -> order_total, shipping -> shipping_cost, funds -> pre_charges_amount,
//   items -> item_total, surcharge -> charges_amount
//
// `supplier_id` is `refinery_id`: features/refiners owns that rename and the
// wire still says supplier.
export function composeOrder(p: SalesOrderParts): Record<string, unknown> {
  return {
    id: p.order.id,
    user_id: p.order.user_id,
    address_id: p.addressLink?.source_address_id ?? null,
    sales_order_status: p.order.status,
    notes: p.order.notes,
    created_at: p.order.created_at,
    updated_at: p.order.updated_at,
    created_by: p.order.created_by,
    updated_by: p.order.updated_by,
    order_number: p.order.number,
    order_total: p.totals?.total ?? null,
    review_created: p.order.review_created,
    shipping_service: p.totals?.shipping_service ?? null,
    shipping_cost: p.totals?.shipping ?? null,
    pre_charges_amount: p.totals?.funds ?? null,
    post_charges_amount: p.totals?.post_charges_amount ?? null,
    subject_to_charges_amount: p.totals?.subject_to_charges_amount ?? null,
    used_funds: p.totals?.used_funds ?? null,
    item_total: p.totals?.items ?? null,
    base_total: p.totals?.base_total ?? null,
    charges_amount: p.totals?.surcharge ?? null,
    order_sent: p.order.order_sent,
    tracking_updated: p.order.tracking_updated,
    sales_tax: p.totals?.sales_tax ?? null,
    supplier_id: p.order.refinery_id,
    order_items: p.items,
    address: p.address,
    user: p.user,
    // A sales order has ONE shipment, not two - there is no return leg. Same
    // all-null-when-absent rule as a purchase order's, because the projection
    // used the same jsonb_build_object.
    shipment: p.shipment ? nestShipment(p.shipment) : EMPTY_SHIPMENT,
  };
}
