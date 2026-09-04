export type FeatureMap = Record<string, Record<string, string[]>>;
export type RenameMap = Record<string, Record<string, string>>;
export type FlowMap = Record<string, Record<string, Record<string, Record<string, string | string[]>>>>;

export const FEATURES: FeatureMap = {
  leads: { "exchange.leads": ["leads.leads"] },
  rates: { "exchange.rates": ["rates.rates"] },
  reviews: { "exchange.reviews": ["reviews.reviews"] },
  tax: {
    "exchange.sales_tax_rules": ["tax.sales_tax_rules"],
    "exchange.state_sales_tax": ["tax.sales_tax"],
  },
  metals: { "exchange.metals": ["metals.metals", "spots.spots"] },
  media: { "exchange.images": ["media.images"] },
  suppliers: { "exchange.suppliers": ["refiners.refiners", "organizations.organizations"] },
  carriers: { "exchange.carriers": ["shipping.carriers", "organizations.organizations"] },
  mints: { "exchange.mints": ["products.mints", "organizations.organizations"] },
  products: { "exchange.products": ["products.bullion"] },
  addresses: { "exchange.addresses": ["places.addresses", "places.user_addresses"] },
  orders: {
    "exchange.purchase_orders": ["orders.orders", "orders.transactions"],
    "exchange.sales_orders": ["orders.orders", "orders.transactions", "refiners.orders"],
    "exchange.purchase_order_items": ["orders.items", "refiners.items"],
    "exchange.sales_order_items": ["orders.items"],
    "exchange.scrap": ["orders.items", "refiners.items"],
    "exchange.order_metals": ["orders.spots"],
    "exchange.addresses": ["places.addresses", "orders.addresses"],
  },
  shipping: {
    "exchange.shipments": ["shipping.shipments", "fulfillments.shipments"],
    "exchange.carrier_services": ["shipping.services"],
    "exchange.tracking_events": ["shipping.tracking"],
    "exchange.carrier_pickups": ["shipping.pickups", "fulfillments.pickups"],
  },
  payments: {
    "exchange.payouts": ["payments.details", "payments.methods", "orders.transactions"],
    "exchange.payment_intents": [
      "payments.intents", "payments.attempts", "payments.settlements", "payments.details",
    ],
  },
  refiners: {
    "exchange.refiner_metals": ["refiners.spots", "refiners.items"],
    "exchange.purchase_orders": ["refiners.orders"],
  },
  users: { "exchange.users": ["auth.users"], "exchange.session": ["auth.sessions"] },
  transactions: { "exchange.account_transactions": ["payments.ledger"] },
  checkout: {
    "exchange.carts": ["checkout.checkouts"],
    "exchange.cart_items": ["checkout.items"],
    "exchange.sell_carts": ["checkout.checkouts"],
    "exchange.sell_cart_items": ["checkout.items"],
  },
};

export const RENAMES: RenameMap = {
  "exchange.products": { product_name: "name", product_description: "description", product_type: "type" },
  "exchange.images": { checksum_sha256: "checksum" },
  "exchange.metals": { type: "name", ask_spot: "ask", bid_spot: "bid" },
  "exchange.suppliers": { is_active: "enabled" },
  "exchange.carriers": { is_active: "enabled" },
  "exchange.purchase_orders": {
    purchase_order_status: "status", order_number: "number",
    total_price: "total", address_id: "-",
  },
  "exchange.sales_orders": {
    sales_order_status: "status", order_number: "number", supplier_id: "refiner_id",
    order_total: "total", item_total: "items", shipping_cost: "shipping",
    charges_amount: "surcharge", pre_charges_amount: "funds", address_id: "-",
  },
  "exchange.purchase_order_items": {
    purchase_order_id: "order_id",
    product_id: "bullion_id",
    scrap_id: "-",
    refiner_premium: "premium",
  },
  "exchange.sales_order_items": { sales_order_id: "order_id", product_id: "bullion_id", sales_tax_rate: "sales_tax_charged" },
  "exchange.scrap": {
    gross_unit: "unit",
    gem_id: "-",
    purity_actual: "purity",
    post_melt_actual: "post_melt",
    content_actual: "content",
  },
  "exchange.order_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  "exchange.refiner_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  "exchange.addresses": {
    user_id: "user_id",
    name: "label",
    is_default: "default_shipping",
  },
  "exchange.shipments": {
    estimated_delivery: "est_delivery",
    shipping_label: "label",
    net_charge: "cost",
    type: "direction",
    service_type: "carrier_service_id",
    package: "package_id",
    carrier_id: "-",
    purchase_order_id: "-",
    sales_order_id: "-",
  },
  "exchange.tracking_events": { scan_time: "time" },
  "exchange.account_transactions": {
    transaction_type: "type",
    purchase_order_id: "order_id",
    sales_order_id: "order_id",
  },
  "exchange.payment_intents": {
    purchase_order_id: "order_id",
    sales_order_id: "order_id",
    payment_status: "status",
    payment_intent_id: "provider_ref",
    amount: "amount_expected",
    amount_received: "settled_amount",
    method_type: "method_id",
    method_id: "provider_ref",
    last_four: "last_four",
    card_brand: "card_brand",
    bank_name: "bank_name",
    bank_account_type: "account_type",
    user_id: "user_id",
    session_id: "session_id",
    type: "type",
    routing: "-",
    amount_capturable: "-",
  },
  "exchange.payouts": {
    account_holder_name: "account_holder",
    method: "method_id",
    cost: "payout_fee",
    order_id: "payout_details_id",
  },
  "exchange.cart_items": { cart_id: "checkout_id", product_id: "bullion_id" },
  "exchange.sell_cart_items": {
    cart_id: "checkout_id",
    product_id: "bullion_id",
    scrap_id: "-",
    gross_unit: "unit",
  },
  "exchange.carrier_services": {
    supports_pickup: "supports_pickups",
    supports_dropoff: "supports_dropoffs",
    max_weight_lbs: "max_weight_lb",
  },
  "exchange.carrier_pickups": { order_id: "-", carrier: "-", pickup_requested_at: "requested_at", pickup_status: "status" },
};

export const DELIBERATE: Record<string, string> = {
  "exchange.metals.scrap_percentage":
    "rate tiering moved to rates.rates, which supersedes a single percentage per metal",
  "exchange.metals.bullion_percentage": "same",
  "exchange.products.sell_display":
    "dropped from products.bullion by migration 119; the sell tab lists every " +
    "product and `display` gates the buy side only (Jacob, 2026-09-03, ruling 49)",
};

export const BLOCKED: Record<string, string> = {};

export const FLOWS: FlowMap = {
  checkout: {
    "exchange.scrap": {
      "checkout.items": {
        pre_melt: "pre_melt",
        post_melt: "post_melt",
        purity: "purity",
        content: "content",
        gross_unit: "unit",
      },
    },
  },
  orders: {
    "exchange.products": {
      "orders.items": {
        gross: "pre_melt",
        content: ["post_melt", "content"],
        purity: "purity",
      },
    },
  },
  refiners: {
    "orders.transactions": {
      "refiners.orders": {
        pool_oz_deducted: "pool_oz_deducted",
        pool_remediation: "pool_remediation",
        refiner_fee: "fee",
      },
    },
  },
};
