// How each feature's exchange tables map onto the new schema.
//
// Extracted from audit-coverage.mjs so audit-precision.mjs can share it. The
// two audits ask different questions of the same map: coverage asks whether a
// column has anywhere to go, precision asks whether what it lands in can hold
// the value without changing it. Keeping one map means a feature declared for
// one audit is automatically covered by the other.

// source table -> the tables its columns are allowed to land in
export const FEATURES = {
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
    "exchange.sales_orders": ["orders.orders", "orders.transactions"],
    "exchange.purchase_order_items": ["orders.items", "refiners.items"],
    "exchange.sales_order_items": ["orders.items"],
    "exchange.scrap": ["orders.items", "refiners.items"],
    "exchange.order_metals": ["orders.spots"],
    "exchange.addresses": ["places.addresses", "orders.addresses"],
  },
  shipping: {
    "exchange.shipments": ["shipping.shipments", "fulfillments.shipments"],
    // Migrated behind SERVICES_SOURCE this session and never declared here, so
    // neither audit had been looking at it. Three columns are pluralised or
    // shortened by the new schema; repo.next.ts aliases them back, which is why
    // the wire shape is unchanged.
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
  refiners: { "exchange.refiner_metals": ["refiners.spots", "refiners.items"] },
  users: { "exchange.users": ["auth.users"], "exchange.session": ["auth.sessions"] },
  // The customer credit ledger. Had no target until 060 - January never built
  // one, and because no feature declared it, every audit walked past seventeen
  // production rows totalling $66,999.32.
  transactions: { "exchange.account_transactions": ["payments.ledger"] },
  // A cart IS a checkout session. exchange keeps the two directions in separate
  // tables; checkout.checkouts has one row per (user_id, direction). A scrap
  // line's values move onto the item rather than living in exchange.scrap.
  checkout: {
    "exchange.carts": ["checkout.checkouts"],
    "exchange.cart_items": ["checkout.items"],
    "exchange.sell_carts": ["checkout.checkouts"],
    "exchange.sell_cart_items": ["checkout.items"],
  },
};

// Columns that moved under a different name. Recorded here so a rename is not
// reported as a loss - and so the renames are written down somewhere.
export const RENAMES = {
  "exchange.products": { product_name: "name", product_description: "description", product_type: "type" },
  "exchange.images": { checksum_sha256: "checksum" },
  "exchange.metals": { type: "name", ask_spot: "ask", bid_spot: "bid" },
  "exchange.suppliers": { is_active: "enabled" },
  "exchange.carriers": { is_active: "enabled" },
  "exchange.purchase_orders": {
    purchase_order_status: "status", order_number: "number",
    // 086: offers are gone. total_price maps to the transaction's total, and
    // the offer columns were dropped from exchange in the same migration.
    total_price: "total", address_id: "-",
  },
  "exchange.sales_orders": {
    sales_order_status: "status", order_number: "number", supplier_id: "refinery_id",
    order_total: "total", item_total: "items", shipping_cost: "shipping",
    charges_amount: "surcharge", pre_charges_amount: "funds", address_id: "-",
  },
  "exchange.purchase_order_items": {
    purchase_order_id: "order_id",
    product_id: "bullion_id",
    scrap_id: "-",
    // -> refiners.items.premium, the refiner's own premium for the line.
    refiner_premium: "premium",
  },
  "exchange.sales_order_items": { sales_order_id: "order_id", product_id: "bullion_id", sales_tax_rate: "sales_tax_charged" },
  // The assay moved to the refiner's line in 065: what the refinery reported
  // once the scrap was melted is refiners.items, and orders.items keeps only
  // what the customer declared.
  "exchange.scrap": {
    gross_unit: "unit",
    gem_id: "-",
    purity_actual: "purity",
    post_melt_actual: "post_melt",
    content_actual: "content",
  },
  "exchange.order_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  "exchange.refiner_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  // An address splits in two: the postal address itself, which has no owner,
  // and places.user_addresses, which is a person's relationship to it. That is
  // why an order can snapshot an address without copying whose it was. These
  // three were previously declared dropped, which was wrong - they relocated.
  // is_default became two columns, since a shipping default and a billing
  // default are not the same fact.
  "exchange.addresses": {
    user_id: "user_id",
    name: "label",
    is_default: "default_shipping",
  },
  // A shipment keeps its id but loses its direct link to the order: that moves
  // to fulfillments.fulfillments.order_id, one row per order. Verified against
  // the data - all 17 copied shipments agree on the renamed columns.
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
  // A payout is a bank account plus a per-order fee, and they separate: the
  // account becomes payments.details, the fee joins the order's other fees.
  // exchange keeps one row per Stripe intent with the status inline; the new
  // schema separates what was asked for from what was tried and what moved.
  "exchange.payment_intents": {
    purchase_order_id: "order_id",
    sales_order_id: "order_id",
    payment_status: "status",
    payment_intent_id: "provider_ref",
    amount: "amount_expected",
    amount_received: "settled_amount",
    method_type: "method_id",
    // The Stripe PaymentMethod id - pm_... - which is NOT payments.intents'
    // method_id. That one is a foreign key saying which kind of payment this is;
    // this is the provider's reference for the instrument used. 077 gave it a
    // home on payments.details, which updateMethod keys on.
    method_id: "provider_ref",
    last_four: "last_four",
    card_brand: "card_brand",
    bank_name: "bank_name",
    bank_account_type: "account_type",
    // These three were declared dropped by 074 and that was wrong: they are what
    // retrievePaymentIntent keys on when it decides whether to reuse a Stripe
    // intent. 075 gave them columns. Declaring a column dropped because nothing
    // obvious reads it is only safe once something has looked at the CODE, not
    // just the data.
    user_id: "user_id",
    session_id: "session_id",
    type: "type",
    // Populated on ZERO production rows. The column exists and updateMethod
    // writes it, but no customer routing number has ever been stored there - so
    // there is nothing to carry, and if there ever were it would want the same
    // encryption treatment as exchange.payouts rather than a plain copy.
    routing: "-",
    bank_account_type: "-",
    amount_capturable: "-",
  },
  "exchange.payouts": {
    account_holder_name: "account_holder",
    method: "method_id",
    cost: "payout_fee",
    order_id: "-",
  },
  "exchange.cart_items": { cart_id: "checkout_id", product_id: "bullion_id" },
  "exchange.sell_cart_items": {
    cart_id: "checkout_id",
    product_id: "bullion_id",
    // The line points at a scrap row in exchange; here the values are on the
    // item, so there is no id to carry. gross_unit is unpopulated on every
    // production row - the unit that matters is the scrap row's, declared as a
    // flow below.
    scrap_id: "-",
    gross_unit: "unit",
  },
  "exchange.carrier_services": {
    supports_pickup: "supports_pickups",
    supports_dropoff: "supports_dropoffs",
    max_weight_lbs: "max_weight_lb",
  },
  // Resolved now that shipping.services and shipping.packages are seeded. A
  // shipment names its service and its box as text; the new schema references
  // them, resolved by (carrier, name) and (carrier, label). The carrier itself
  // is then reachable through the service, so it needs no column of its own.
  // payments is not a reshaping of exchange - it is a different model with no
  // shared ids and a different granularity, so these are not renames and are
  // deliberately not declared as such. Left reported so the gap stays visible.
  "exchange.carrier_pickups": { order_id: "-", carrier: "-", pickup_requested_at: "requested_at", pickup_status: "status" },
};

// Columns deliberately not carried across, with the reason. Distinct from a
// rename: these hold data that was reviewed and judged not worth moving. Listed
// so the report shows real gaps rather than decisions already taken - a report
// that cries wolf is one people stop reading.
export const DELIBERATE = {
  "exchange.metals.scrap_percentage":
    "rate tiering moved to rates.rates, which supersedes a single percentage per metal",
  "exchange.metals.bullion_percentage": "same",
};

// Columns whose destination exists but is itself blocked on a decision. They
// are real gaps, not decisions taken, so they are reported - but reported as
// blocked, because adding a column for them now would prejudge the answer.
export const BLOCKED = {};

// Value flows the backfills perform that are not ownership mappings.
//
// FEATURES answers "where does this table's data live now", which is what
// coverage needs. It is the wrong question for precision, because a value can
// land in a table that does not own it. orders.items takes its weights and
// assay from whichever of exchange.scrap or exchange.products the line points
// at - `coalesce(s.purity, pr.purity)` in 031_backfill_orders.sql - and a
// product plainly does not become an order line, so exchange.products is not
// listed under orders in FEATURES and never will be.
//
// That omission is exactly how the .9999 rounding survived every check: the
// scrap side declares purity numeric(4,3) and orders.items matched it, so the
// only pair anyone compared agreed. The product side, which is unconstrained,
// was never compared to anything.
//
//   source table -> target table -> { source column: target column(s) }
export const FLOWS = {
  // A sell cart line's weights and assay come from the scrap row it points at,
  // which is not an ownership mapping - a piece of scrap does not become a
  // checkout - but the values really do land there.
  checkout: {
    "exchange.scrap": {
      "checkout.items": {
        pre_melt: "pre_melt",
        post_melt: "post_melt",
        purity: "purity",
        content: "content",
        gross_unit: "unit",
        // 085/086: no premium is copied. It is resolved from rates when the
        // checkout becomes an order.
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
};
