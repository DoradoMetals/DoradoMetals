// The array API (ruling 34): array in, array of PRICES out.
//
// The eleven functions it wraps are pinned by bid.test.js and ask.test.js,
// which moved here unchanged. What is pinned HERE is the shape of the new
// surface and the three things that are easy to get wrong about it: that it
// returns numbers rather than items, that quantity applies to bullion and not
// to scrap, and that it asks the `bullion_id IS NULL` question of a raw
// orders.items row as well as of an assembled line.
import test from "node:test";
import assert from "node:assert/strict";
import { unitPrices, lineTotals } from "#domain/pricing/service.ts";
import type { PriceableLine } from "#domain/pricing/service.ts";

const spots = [
  { name: "Gold", bid: 4000 },
  { name: "Silver", bid: 30 },
];

const scrap = (over: PriceableLine = {}): PriceableLine => ({
  item_type: "scrap",
  premium: 0.9,
  scrap: { metal: "Gold", content: 2 },
  ...over,
});

const bullion = (over: PriceableLine = {}): PriceableLine => ({
  item_type: "product",
  quantity: 1,
  product: { metal_type: "Silver", content: 1, bid_premium: 0.8 },
  ...over,
});

test("one call prices every line, and the answer is numbers", () => {
  const prices = unitPrices([scrap(), bullion()], spots);
  assert.deepEqual(prices, [7200, 24]);
  assert.ok(prices.every((p) => typeof p === "number"));
});

test("an array of one is how a single item is priced", () => {
  assert.deepEqual(unitPrices([scrap()], spots), [7200]);
});

test("nothing in returns nothing out, without touching spots", () => {
  assert.deepEqual(unitPrices([], null), []);
  assert.deepEqual(lineTotals([], null), []);
});

test("the answer is positionally aligned with the request", () => {
  const items = [bullion(), scrap(), bullion({ quantity: 3 })];
  const totals = lineTotals(items, spots);
  assert.equal(totals.length, items.length);
  assert.deepEqual(totals, [24, 7200, 72]);
});

// The asymmetry that is load-bearing: a scrap line's `content` already
// describes the whole lot, so multiplying it by quantity would double-count a
// customer's metal. Every existing sum honours this and so must the array API.
test("quantity multiplies bullion and never scrap", () => {
  assert.deepEqual(lineTotals([bullion({ quantity: 4 })], spots), [96]);
  assert.deepEqual(lineTotals([scrap({ quantity: 4 })], spots), [7200]);
});

test("a stored price wins over the calculation, as it does everywhere else", () => {
  assert.deepEqual(unitPrices([scrap({ price: 123 })], spots), [123]);
  assert.deepEqual(lineTotals([bullion({ price: 5, quantity: 3 })], spots), [15]);
});

// Ruling 34c: orders.items is one shape, so the question is `bullion_id IS
// NULL` rather than two parallel paths. A caller holding a raw row prices it
// without composing first.
test("a raw orders.items row is identified by bullion_id", () => {
  const row = (over: PriceableLine): PriceableLine => ({ premium: 0.9, ...over });
  assert.deepEqual(
    unitPrices(
      [
        row({ bullion_id: null, scrap: { metal: "Gold", content: 2 } }),
        row({ bullion_id: "a-real-id", product: { metal_type: "Silver", content: 1 }, premium: 0.8, quantity: 1 }),
      ],
      spots
    ),
    [7200, 24]
  );
});

// "items of an unknown type contribute nothing" pins this on the order total;
// it has to hold here too, and as a 0 rather than a hole - a caller summing an
// array of prices should not have to know one of them might not be a number.
test("a line of neither kind prices at zero, not undefined", () => {
  const prices = unitPrices([{ item_type: "mystery" }, scrap()], spots);
  assert.deepEqual(prices, [0, 7200]);
  assert.equal(prices.reduce((a, b) => a + b, 0), 7200);
});

// An explicitly unrecognised item_type is NOT second-guessed by looking at
// bullion_id. A line the assembler could not identify must stay unidentified.
test("an unrecognised item_type is not overridden by bullion_id", () => {
  assert.deepEqual(
    unitPrices([{ item_type: "mystery", bullion_id: null, scrap: { metal: "Gold", content: 2 }, premium: 0.9 }], spots),
    [0]
  );
});

// The bid side throws on a metal with no spot, deliberately (ruling 24: the
// `spot!` assertions are pinned by a test asserting a TypeError). Going through
// the array API must not turn that into a silent NaN travelling to a payout.
test("a metal absent from spots still throws rather than becoming NaN", () => {
  assert.throws(
    () => unitPrices([scrap({ scrap: { metal: "Platinum", content: 1 } })], spots),
    TypeError
  );
});
