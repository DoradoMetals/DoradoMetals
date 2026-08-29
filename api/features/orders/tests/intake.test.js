// The decomposition, tested without a database.
//
// This is the half of the orders collapse that can be pinned down exactly:
// given the block the frontend posts, what did the customer actually ask for.
// Everything it gets wrong is wrong in a way that produces a plausible order
// nobody would query - a parcel addressed to the person who already has it, a
// premium quietly changed, a handoff silently reinterpreted - so these are
// mostly about the mappings that would fail quietly.
import test from "node:test";
import assert from "node:assert/strict";
import { decompose, handoffMethods } from "#features/orders/intake.ts";

// The payload frontend/features/orders/purchaseOrders/users/queries.ts sends,
// field for field, with only the values changed.
const block = (over = {}) => ({
  address: {
    id: "11111111-1111-1111-1111-111111111111",
    name: "A Customer",
    line_1: "1 Test St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    country_code: "US",
    phone_number: "5550000000",
  },
  package: {
    label: "Small Box",
    weight: { units: "LB", value: 3 },
    dimensions: { length: 9, width: 6, height: 4, units: "IN" },
  },
  fedexPackageToggle: false,
  pickup: { label: "DROPOFF_AT_FEDEX_LOCATION", name: "Store Dropoff", date: "2026-09-01", time: "" },
  service: {
    serviceType: "FEDEX_2_DAY",
    serviceDescription: "FedEx 2Day",
    netCharge: 24.5,
    currency: "USD",
    code: "FDXE",
  },
  payoutValid: true,
  payout: { method: "ACH", account_holder_name: "A Customer", bank_name: "Test", cost: 0 },
  confirmation: true,
  insurance: { declaredValue: { amount: 5000, currency: "USD" }, insured: true },
  items: [
    { type: "scrap", data: { id: "s1", metal: "Gold", quantity: 1, pre_melt: 10, post_melt: 9.5, purity: 0.9999, content: 9.4991, gross_unit: "g", name: "Ring" } },
  ],
  ...over,
});

test("a dropoff becomes a CARRIER DROPOFF shipment", () => {
  const out = decompose(block(), { direction: "purchase", userId: "u1" });
  assert.equal(out.direction, "purchase");
  assert.equal(out.fulfillment.method_type, "CARRIER DROPOFF");
  assert.equal(out.fulfillment.category, "SHIPMENT");
  assert.equal(out.fulfillment.carrier_pickup, undefined);
  assert.equal(out.fulfillment.pickup, undefined);
  assert.equal(out.fulfillment.direct, undefined);
});

// The mapping has to agree with 052_backfill_fulfillments.sql, which was
// verified against all 70 production shipments. If they drift, an order placed
// today and an order migrated from January stop being comparable.
test("the handoff mapping matches the one the backfill used", () => {
  assert.equal(handoffMethods["Store Dropoff"].type, "CARRIER DROPOFF");
  assert.equal(handoffMethods["DropShip"].type, "DROPSHIP");
});

test("a carrier pickup carries the date and time it was booked for", () => {
  const out = decompose(
    block({ pickup: { label: "CONTACT_FEDEX_TO_SCHEDULE", name: "Carrier Pickup", date: "2026-09-02", time: "14:00" } }),
    { direction: "purchase", userId: "u1" }
  );
  assert.equal(out.fulfillment.method_type, "CARRIER PICKUP");
  assert.equal(out.fulfillment.category, "SHIPMENT");
  assert.deepEqual(out.fulfillment.carrier_pickup, { date: "2026-09-02", time: "14:00" });
});

// A courier collecting a parcel and us driving out to a customer share a word
// and nothing else. Filing one as the other puts a shipment on the list of
// places an employee is due to be.
test("a carrier pickup is a shipment, not a fulfillments.pickups row", () => {
  const out = decompose(
    block({ pickup: { name: "Carrier Pickup", date: "2026-09-02", time: "14:00" } }),
    { direction: "purchase" }
  );
  assert.equal(out.fulfillment.pickup, undefined, "a courier is not an in-person collection");
  assert.equal(out.fulfillment.category, "SHIPMENT");
});

// The one that prints a label sending the parcel to the person who already has
// the metal.
test("the customer is the shipper on a purchase and the recipient on a sale", () => {
  const buy = decompose(block(), { direction: "purchase" });
  assert.equal(buy.fulfillment.shipment.shipper_address.city, "Dallas");
  assert.equal(buy.fulfillment.shipment.recipient_address, null);

  const sell = decompose(block({ payout: null }), { direction: "sale" });
  assert.equal(sell.fulfillment.shipment.recipient_address.city, "Dallas");
  assert.equal(sell.fulfillment.shipment.shipper_address, null);
});

test("a sale carries no payout", () => {
  const out = decompose(block(), { direction: "sale" });
  assert.equal(out.payout, null, "a payout is money going out on a purchase");
});

test("the shipment keeps everything the label needs", () => {
  const { shipment } = decompose(block(), { direction: "purchase" }).fulfillment;
  assert.equal(shipment.service_type, "FEDEX_2_DAY");
  assert.equal(shipment.carrier_code, "FDXE");
  assert.equal(shipment.package_label, "Small Box");
  assert.equal(shipment.weight.value, 3);
  assert.equal(shipment.insured, true);
  assert.equal(shipment.declared_value, 5000);
});

// Scrap and bullion are one table in the new schema. What tells them apart is
// which id is set, not which table they came from.
test("scrap and bullion decompose to the same shape", () => {
  const out = decompose(
    block({
      items: [
        { type: "scrap", data: { id: "s1", metal: "Gold", quantity: 2, content: 1.5, bid_premium: 0.8 } },
        { type: "product", data: { id: "p1", metal_type: "Silver", quantity: 3, content: 1, bid_premium: 0.9 } },
      ],
    }),
    { direction: "purchase" }
  );

  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].kind, "scrap");
  assert.equal(out.items[0].bullion_id, undefined);
  assert.equal(out.items[1].kind, "product");
  assert.equal(out.items[1].bullion_id, "p1");
  // Same keys for the values an order is priced from, whichever kind it is.
  for (const i of out.items) {
    assert.ok("metal" in i && "quantity" in i && "premium" in i && "content" in i);
  }
});

// THE PREMIUM COMES FROM RATES.
//
// These two tests used to assert the opposite: that a line with no premium got
// 0.75, and that a posted premium of 0 survived. Both were pinning a hardcode.
// 0.75 was never a rate - 033 added orders.items.bid_premium mirroring
// exchange.scrap's column, 065 recorded that it was "the hardcoded default in
// features/scrap/repo.js", and it was read back out as if it were a decision.
// 085 drops the column and the premium is resolved from rates.rates here.
const rates = [
  { metal: "Gold", unit: "troy_oz", min_qty: 0, max_qty: 10, scrap_pct: 0.75, bullion_pct: 0.8 },
  { metal: "Gold", unit: "troy_oz", min_qty: 10, max_qty: null, scrap_pct: 0.81, bullion_pct: 0.84 },
];

test("a scrap line takes scrap_pct from the band its metal total falls in", () => {
  const out = decompose(
    block({ items: [{ type: "scrap", data: { id: "s1", metal: "Gold", content: 4 } }] }),
    { direction: "purchase", rates }
  );
  assert.equal(out.items[0].premium, 0.75, "4oz should sit in the 0-10 band");
  assert.equal(out.items[0].quantity, 1);
});

// The band is chosen on the TOTAL for the metal across the order, not per line.
// Two 6oz lines are a 12oz order and both price at the higher band - which is
// the whole reason this cannot be resolved inside item().
test("two lines of one metal are banded on their combined total", () => {
  const out = decompose(
    block({ items: [
      { type: "scrap", data: { id: "s1", metal: "Gold", content: 6 } },
      { type: "scrap", data: { id: "s2", metal: "Gold", content: 6 } },
    ] }),
    { direction: "purchase", rates }
  );
  assert.equal(out.items[0].premium, 0.81, "12oz total should reach the 10+ band");
  assert.equal(out.items[1].premium, 0.81);
});

test("a bullion line takes bullion_pct from the same band a scrap line would", () => {
  const out = decompose(
    block({ items: [{ type: "product", data: { id: "p1", metal_type: "Gold", content: 4 } }] }),
    { direction: "purchase", rates }
  );
  assert.equal(out.items[0].premium, 0.8, "a product should take bullion_pct, not scrap_pct");
});

// Null, not a number. A line the rates cannot price is not a line worth
// guessing a price for, and the old fallback is exactly what this replaces.
test("no matching band leaves the premium null rather than inventing one", () => {
  const out = decompose(
    block({ items: [{ type: "scrap", data: { id: "s1", metal: "Palladium", content: 4 } }] }),
    { direction: "purchase", rates }
  );
  assert.equal(out.items[0].premium, null);
});

test("no rates at all leaves the premium null", () => {
  const out = decompose(
    block({ items: [{ type: "scrap", data: { id: "s1", metal: "Gold", content: 4 } }] }),
    { direction: "purchase" }
  );
  assert.equal(out.items[0].premium, null, "a missing rates list must not fall back to a literal");
});

// A premium posted by the frontend is IGNORED. It is not the frontend's to set:
// the same block used to carry bid_premium and it was written straight through.
test("a premium posted in the block is ignored", () => {
  const out = decompose(
    block({ items: [{ type: "scrap", data: { id: "s1", metal: "Gold", content: 4, bid_premium: 0.99 } }] }),
    { direction: "purchase", rates }
  );
  assert.equal(out.items[0].premium, 0.75, "the posted 0.99 should not reach the item");
});

// Purity is the value that was being rounded to 1.000 by orders.items until
// migration 058. It has to survive the decomposition at full precision too.
test("four nines of purity survive", () => {
  const out = decompose(block(), { direction: "purchase" });
  assert.equal(out.items[0].purity, 0.9999);
  assert.equal(out.items[0].content, 9.4991);
});

// A handoff nobody recognises means the frontend grew an option the API did
// not. Filing it as a dropoff would record a choice the customer never made.
test("an unknown handoff is refused rather than defaulted", () => {
  assert.throws(
    () => decompose(block({ pickup: { name: "Drone Delivery" } }), { direction: "purchase" }),
    /unknown handoff "Drone Delivery"/
  );
});

test("no handoff at all is legal and leaves the method unchosen", () => {
  const out = decompose(block({ pickup: undefined }), { direction: "purchase" });
  assert.equal(out.fulfillment.method_type, null);
  assert.equal(out.fulfillment.category, null);
  assert.equal(out.fulfillment.shipment, undefined);
});

test("an order with no items is refused", () => {
  assert.throws(() => decompose(block({ items: [] }), { direction: "purchase" }), /at least one item/);
  assert.throws(
    () => decompose(block({ items: [{ type: "mystery", data: { id: "x" } }] }), { direction: "purchase" }),
    /at least one item/,
    "a line of an unknown type is dropped, and dropping every line leaves nothing"
  );
});

test("a direction that is not one of the two is refused", () => {
  assert.throws(() => decompose(block(), { direction: "buy" }), /direction must be/);
  assert.throws(() => decompose(block(), {}), /direction must be/);
  assert.throws(() => decompose(null, { direction: "purchase" }), /nothing to decompose/);
});
