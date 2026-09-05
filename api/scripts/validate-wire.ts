import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";
import * as c from "@dorado/contracts";
import type { ZodType } from "zod/v4";

type WireSchema = ZodType<unknown>;
type Case = {
  name: string;
  schema: WireSchema;
  load: () => unknown;
  many: boolean;
};

const cases: Case[] = [];
const add = (name: string, schema: WireSchema, load: () => unknown, many = true) =>
  cases.push({ name, schema, load, many });

const carriersService = await import("#logistics/shipping/carriers/service.ts");
add("GET /carriers", c.CarrierRead, () => carriersService.getAllCarriers());
const servicesService = await import("#logistics/shipping/services/service.ts");
add("GET /carrier_services", c.CarrierServiceRead, () => servicesService.getAllServices());
const pickupsService = await import("#logistics/shipping/pickups/service.ts");
add("GET /carrier_pickups", c.ShipmentPickup, () => pickupsService.getAll());

const { rows: withAddresses } = await pool.query(
  `SELECT user_id FROM exchange.addresses WHERE user_id IS NOT NULL
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1`
);
const addressUser = withAddresses[0]?.user_id;
const addressesService = await import("#identity/places/addresses/service.ts");
const addressBook = async () =>
  addressUser ? await addressesService.list(addressUser) : [];
add("GET /addresses", c.AddressBookEntry, addressBook);
add("GET /addresses/:id", c.AddressBookEntry, async () => {
  const book = await addressBook();
  const first = book[0];
  return first && addressUser
    ? [await addressesService.getOne(first.address.id, addressUser)]
    : [];
});

const { rows: withLedger } = await pool.query(
  `SELECT user_id FROM payments.ledger
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1`
);
const ledgerUser = withLedger[0]?.user_id;
if (!ledgerUser) {
  add("GET /transactions", c.AccountTransaction, () => {
    throw new Error("dev has no payments.ledger rows - the ledger check would be vacuous");
  });
} else {
  const transactionsService = await import("#payments/transactions/service.ts");
  add(
    "GET /transactions",
    c.AccountTransaction,
    () => transactionsService.history(ledgerUser)
  );
}

const fulfillments = await import("#logistics/fulfillments/service.ts");
const fulfillmentMethods = await import("#db/fulfillments/methods/repo.ts");

add("GET /fulfillments/methods (purchase)", c.FulfillmentMethodRead, () =>
  fulfillmentMethods.getAvailable("purchase")
);
add("GET /fulfillments/methods (sale)", c.FulfillmentMethodRead, () =>
  fulfillmentMethods.getAvailable("sale")
);
add("GET /fulfillments/methods/all", c.FulfillmentMethodRead, () =>
  fulfillmentMethods.getAll()
);

add("GET /fulfillments/schedule", c.FulfillmentView, async () =>
  await fulfillments.getSchedule(null, null, null)
);

const salesOrderIds = async () => {
  const { rows } = await pool.query(
    `SELECT sales_order_id FROM exchange.payment_intents WHERE sales_order_id IS NOT NULL`
  );
  return rows.map((r) => r.sales_order_id);
};
const intents = async (m: Record<string, unknown>) => {
  const out = [];
  for (const id of await salesOrderIds()) {
    const fn = m.findForOrder;
    if (typeof fn !== "function") {
      throw new Error(
        "the intents repo has no findForOrder - the read this check names has " +
          "moved, which is D110's shape"
      );
    }
    const row = await fn(id);
    if (row) out.push(row);
  }
  return out;
};
add(
  "GET /stripe/get_sales_order_payment_intent [payments]",
  c.PaymentIntentView,
  async () => intents(await import("#db/payments/intents/repo.ts"))
);

const productsService = await import("#catalog/products/service.ts");
add("GET /products", c.BullionGroup, () => productsService.listGroups({ display: true }));
add("GET /products (sell)", c.BullionGroup, () => productsService.listGroups({}));
add("GET /products (row)", c.BullionStorefront, async () =>
  (await productsService.listGroups({})).flatMap((g) => [g.default, ...g.variants])
);
add("GET /products/admin", c.BullionAdmin, () => productsService.listAdminProducts());

const spotsService = await import("#pricing/spots/service.ts");
add("GET /spots", c.SpotTicker, () => spotsService.listTicker());
const ratesService = await import("#pricing/rates/service.ts");
add("GET /rates", c.RateRead, () => ratesService.listRates());
add("GET /rates/admin", c.AdminRate, () => ratesService.listAdminRates());
add("GET /rates/tiers", c.RateTier, () => ratesService.listTiers());

const orderRead = await import("#orders/read.ts");
const orders = await orderRead.list("purchase", null);
add("GET /orders", c.OrderRead, () => orderRead.list(null, null));

const orderSpotsRepo = await import("#db/orders/spots/repo.ts");
add("GET /orders/:id/spots", c.OrderSpot, async () => {
  const lists = await Promise.all(orders.map((o) => orderSpotsRepo.getRowsFor(o.id)));
  return lists.flat();
});
const refinerOrdersService = await import("#orders/refiners/orders/service.ts");
const refinerSpotsService = await import("#orders/refiners/spots/service.ts");
add("GET /orders/:orderId/refiners", c.RefinerOrder, async () => {
  const reads = await Promise.all(orders.map((o) => refinerOrdersService.getByOrder(o.id)));
  return reads.filter(Boolean);
});
const refinerItemsRepo = await import("#db/refiners/items/repo.ts");
add("GET /orders/:orderId/refiners/items", c.RefinerItem, async () => {
  const lists = await Promise.all(orders.map((o) => refinerItemsRepo.getForOrder(o.id)));
  return lists.flat();
});
add("GET /orders/:orderId/refiners/spots", c.RefinerSpot, async () => {
  const lists = await Promise.all(
    orders.map((o) => refinerSpotsService.forOrder(o.id))
  );
  return lists.filter(Boolean).flat();
});
const fulfillmentPickups = await import("#logistics/fulfillments/pickups/service.ts");
const fulfillmentDirects = await import("#logistics/fulfillments/directs/service.ts");
add("GET /orders/:orderId/fulfillments", c.FulfillmentView, async () => {
  const reads = await Promise.all(
    orders.map((o) => fulfillments.getForOrder(o.id, null, true))
  );
  return reads.filter(Boolean);
});

const orderItemsRepo = await import("#db/orders/items/repo.ts");
add("GET /orders/:id/items", c.OrderItem, async () => {
  const lists = await Promise.all(orders.map((o) => orderItemsRepo.getFor(o.id)));
  return lists.flat();
});
const shipmentView = await import("#logistics/shipping/shipments/view.ts");
add("GET /orders/:orderId/shipments", c.ShipmentView, async () => {
  const lists = await Promise.all(orders.map((o) => shipmentView.forOrder(o.id, true)));
  return lists.flat();
});
add("GET /orders/:orderId/pickups", c.FulfillmentPickup, async () => {
  const lists = await Promise.all(orders.map((o) => fulfillmentPickups.forOrder(o.id)));
  return lists.flat();
});
add("GET /orders/:orderId/directs", c.FulfillmentDirect, async () => {
  const lists = await Promise.all(orders.map((o) => fulfillmentDirects.forOrder(o.id)));
  return lists.flat();
});
const orderReadDomain = await import("#orders/read.ts");
add("GET /orders/:id", c.OrderView.omit({ payout: true }), async () => {
  const views = await Promise.all(orders.map((o) => orderReadDomain.view(o.id)));
  return views.filter((v): v is NonNullable<typeof v> => v != null)
    .map(({ payout, ...rest }) => rest);
});

const orderAddressesRepo = await import("#db/orders/addresses/repo.ts");
const placeAddressesRepo = await import("#db/places/addresses/repo.ts");
add("GET /orders/:id/address", c.Address, async () => {
  const links = await Promise.all(orders.map((o) => orderAddressesRepo.getFor(o.id)));
  const rows = await Promise.all(
    links
      .filter((l): l is NonNullable<typeof l> => l != null)
      .map((l) => placeAddressesRepo.getOne(l.address_id))
  );
  return rows.filter(Boolean);
});

const pricing = await import("#pricing/index.ts");
const { rows: quotable } = await pool.query(
  `SELECT id, name FROM products.bullion
    WHERE display AND content IS NOT NULL
    ORDER BY name LIMIT 2`
);
add("POST /quotes/catalog", c.ProductQuote, () =>
  quotable.length ? pricing.priceProduct(quotable[0].id, "ask", 1) : [],
  false
);

const { rows: quoteMetals } = await pool.query(
  `SELECT id FROM metals.metals WHERE name = 'Gold' LIMIT 1`
);
const checkoutService = await import("#checkout/service.ts");

const saleBasket = addressUser && quotable.length
  ? await checkoutService.getRowFor(addressUser, "sale")
  : null;
if (saleBasket) {
  await checkoutService.replaceItems(
    addressUser!, "sale", [{ bullion_id: quotable[0].id, quantity: 1 }]
  );
}
add("GET /quotes/checkout (sale)", c.SaleQuote, () =>
  saleBasket ? pricing.priceCheckout(saleBasket.id) : [],
  false
);

const purchaseBasket = addressUser && quotable.length && quoteMetals.length
  ? await checkoutService.getRowFor(addressUser, "purchase")
  : null;
if (purchaseBasket) {
  await checkoutService.replaceItems(
    addressUser!, "purchase",
    [
      { metal_id: quoteMetals[0].id, pre_melt: 31.1035, purity: 0.9, unit: "g", quantity: 1 },
      { bullion_id: quotable[0].id, quantity: 2 },
    ]
  );
}
add("GET /quotes/checkout (purchase)", c.PurchaseQuote, () =>
  purchaseBasket ? pricing.priceCheckout(purchaseBasket.id) : [],
  false
);

const { rows: quotableOrders } = await pool.query(
  `SELECT id FROM orders.orders ORDER BY created_at ASC, id ASC LIMIT 1`
);
add("POST /quotes/order", c.OrderPricing, () =>
  quotableOrders.length ? pricing.priceOrder(quotableOrders[0].id) : [],
  false
);

add("POST /quotes/profit_breakdown", c.ProfitBreakdown, () =>
  quotableOrders.length ? pricing.profitBreakdown({ order_id: quotableOrders[0].id }) : [],
  false
);

const CASE_FLOOR = Number(process.env.WIRE_CASE_FLOOR ?? 30);
if (cases.length < CASE_FLOOR) {
  console.error(
    `validate:wire registered only ${cases.length} case(s), expected at least ` +
      `${CASE_FLOOR}. A case that fails to register is a shape nobody checked, and ` +
      `the summary line cannot tell that from a shape that matched.`
  );
  process.exit(1);
}

let pass = 0;
const failures = [];
const skipped = [];

const undeclaredTotal = new Map();

for (const { name, schema, load } of cases) {
  let rows;
  try {
    rows = await load();
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    failures.push({ name, issues: new Map([[`could not load: ${why}`, 1]]) });
    continue;
  }
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) {
    console.log(`  skip  ${name}  (no rows)`);
    skipped.push(name);
    continue;
  }

  const issues = new Map();
  const undeclared = new Set();
  for (const row of list) {
    const wire = JSON.parse(JSON.stringify(row));
    const result = schema.safeParse(wire);
    if (result.success && wire && typeof wire === "object" && !Array.isArray(wire)) {
      const parsed = result.data;
      if (parsed && typeof parsed === "object") {
        for (const k of Object.keys(wire)) if (!(k in parsed)) undeclared.add(k);
      }
    }
    if (result.success) continue;
    for (const i of result.error.issues) {
      const key = `${i.path.join(".") || "(root)"}: ${i.message}`;
      issues.set(key, (issues.get(key) ?? 0) + 1);
    }
  }

  if (issues.size) failures.push({ name, issues, count: list.length });
  else {
    pass++;
    const extra = undeclared.size ? `  UNDECLARED: ${[...undeclared].join(", ")}` : "";
    console.log(`  ok    ${name}  (${list.length} rows)${extra}`);
  }
  if (undeclared.size) undeclaredTotal.set(name, [...undeclared]);
}

if (failures.length) {
  console.log();
  for (const f of failures) {
    console.log(`FAIL  ${f.name}${f.count ? `  (${f.count} rows)` : ""}`);
    for (const [issue, n] of [...f.issues].sort((a, b) => b[1] - a[1])) {
      console.log(`        ${n}x  ${issue}`);
    }
  }
}

console.log();
if (undeclaredTotal.size) {
  console.log(`${undeclaredTotal.size} endpoint(s) RETURN FIELDS NO CONTRACT DECLARES:`);
  for (const [name, keys] of undeclaredTotal) console.log(`        ${name}: ${keys.join(", ")}`);
  console.log("      zod strips these silently - regenerate the contracts, or stop selecting them.");
  console.log();
  process.exitCode = 1;
}
console.log(
  `${pass} endpoint shape(s) match, ${failures.length} diverge, ${skipped.length} skipped for want of a fixture` +
    (skipped.length ? `: ${skipped.join(", ")}` : "")
);

const PASS_FLOOR = Number(process.env.WIRE_PASS_FLOOR ?? 25);
if (pass + failures.length < PASS_FLOOR) {
  console.error(
    `only ${pass + failures.length} of ${cases.length} registered case(s) had rows to ` +
      `parse, expected at least ${PASS_FLOOR}. The fixtures this depends on are gone, ` +
      `or the loaders are failing quietly - either way the contracts were not checked.`
  );
  process.exitCode = 1;
}

if (failures.length) process.exitCode = 1;
await pool.end();
