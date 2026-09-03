// D97: the estimated payout comes from the server. The checkout's headline
// figure used to be `(quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)` -
// `+` binds tighter than `??`, so ONE deduction was always silently discarded
// (with a service selected, the payout fee vanished and the number read high
// while the rows beneath it said otherwise).
// These pin the server's answer, not the component's - the frontend computes no
// money, so getting the arithmetic right here is the whole fix.
//
// THE BODY IS IDS AND A DECLARATION NOW (D214 item 11): a scrap line names its
// metal by id and states the weight, purity and unit it was declared at, and
// the server derives the content. `content` was a field a customer could send,
// which is the quantity of fine metal they are paid for.
import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import * as quotes from "#domain/quotes/service.ts";
import { PurchaseOrderQuoteBody } from "@dorado/contracts";
import query from "#shared/db/query.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES];

let goldId: string;
// The payout methods this file prices against, by the type each one is.
const methodIdOf = new Map<string, string>();

beforeAll(async () => {
  const [gold] = await outside<{ id: string }>(
    `SELECT id FROM metals.metals WHERE name = 'Gold' LIMIT 1`
  );
  assert.ok(gold, "dev has no Gold metal row to declare scrap against");
  goldId = gold.id;

  const methods = await outside<{ id: string; type: string }>(
    `SELECT id, type FROM payments.methods WHERE direction = 'purchase'`
  );
  for (const method of methods) methodIdOf.set(method.type, method.id);
  for (const type of ["ACH", "WIRE", "ECHECK", "DORADO_ACCOUNT"]) {
    assert.ok(methodIdOf.get(type), `dev has no ${type} payout method - these prove nothing`);
  }
});

// One troy ounce of fine gold, declared: 1 t oz at purity 1. No product row and
// no fixture, which is what makes it safe to assert exact money against.
const goldOunce = () => ({
  type: "scrap" as const, metal_id: goldId, pre_melt: 1, purity: 1, unit: "t oz",
});

async function goldBid(): Promise<number> {
  const { rows } = await query<{ bid: number }>(
    `SELECT s.bid FROM spots.spots s
       JOIN metals.metals m ON m.id = s.metal_id
      WHERE m.name = 'Gold'`
  );
  return Number(rows[0]?.bid ?? 0);
}

test("both deductions apply, and neither cancels the other", async () => {
  await inPinnedTransaction(async () => {
    const bare = await quotes.purchaseOrderQuote({ items: [goldOunce()] });

    const both = await quotes.purchaseOrderQuote({
      items: [goldOunce()],
      shipping_charge: 12.5,
      payout_method_id: methodIdOf.get("WIRE"),
    });

    assert.equal(both.total, bare.total, "the goods total is not what changed");
    assert.equal(both.shipping_charge, 12.5);
    assert.equal(both.payout_charge, 20, "WIRE costs $20");

    // THE ASSERTION THE BUG WOULD FAIL. The broken expression produced
    // total - 12.5 (payment cost discarded); this is total - 12.5 - 20.
    assert.equal(
      Number(both.estimated_payout.toFixed(4)),
      Number((both.total - 32.5).toFixed(4)),
      "one of the two deductions went missing, which is exactly D97"
    );
    assert.ok(
      both.estimated_payout < bare.total - 12.5,
      "the payout fee did not come off"
    );
  }, { lock: ORDER_LOCKS });
});

test("a quote with no choices made yet deducts nothing", async () => {
  await inPinnedTransaction(async () => {
    const q = await quotes.purchaseOrderQuote({ items: [goldOunce()] });
    assert.equal(q.shipping_charge, 0);
    assert.equal(q.payout_charge, 0);
    assert.equal(q.estimated_payout, q.total);
  }, { lock: ORDER_LOCKS });
});

test("a free payout method deducts nothing, and says so rather than omitting it", async () => {
  await inPinnedTransaction(async () => {
    for (const type of ["ACH", "ECHECK", "DORADO_ACCOUNT"]) {
      const q = await quotes.purchaseOrderQuote({
        items: [goldOunce()], payout_method_id: methodIdOf.get(type),
      });
      assert.equal(q.payout_charge, 0, `${type} is free`);
      assert.equal(q.estimated_payout, q.total);
    }
  }, { lock: ORDER_LOCKS });
});

// Ruling 43 - ids in, data out. The fee is resolved from the METHOD's own row;
// a caller cannot send a number and be believed, and the contract has no field
// for one to arrive in.
test("the payout fee is not taken from the body", () => {
  const withAFee = PurchaseOrderQuoteBody.safeParse({
    items: [{ type: "scrap", metal_id: "00000000-0000-4000-8000-000000000000",
              pre_melt: 1, purity: 1 }],
    payout_charge: 0,
    cost: 0,
  });
  assert.equal(withAFee.success, false, "a fee sent in the body was accepted");
});

// A line cannot declare its own content either: that is the quantity of fine
// metal the customer is paid for, and the server derives it from the weight,
// the purity and the unit.
test("a scrap line cannot declare its own content", () => {
  const stated = PurchaseOrderQuoteBody.safeParse({
    items: [{ type: "scrap", metal_id: "00000000-0000-4000-8000-000000000000",
              pre_melt: 1, purity: 1, content: 100 }],
  });
  assert.equal(stated.success, false, "a stated content was accepted");
});

test("a payout method the business does not pay by is refused, not priced as free", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => quotes.purchaseOrderQuote({
        items: [goldOunce()],
        payout_method_id: "00000000-0000-4000-8000-000000000000",
      }),
      (err: { kind?: string; message: string }) => {
        assert.equal(err.kind, "invalid");
        assert.match(err.message, /is not a payout method/);
        return true;
      }
    );
  }, { lock: ORDER_LOCKS });
});

// The shipping charge is the one number this body carries, so what it will not
// take matters: a missing charge accepted as a legitimate zero quotes a payout
// that is TOO HIGH, which is the exact class of bug this surface exists to end.
test("a shipping charge that is not a charge is refused rather than coerced to zero", () => {
  const line = {
    type: "scrap", metal_id: "00000000-0000-4000-8000-000000000000",
    pre_melt: 1, purity: 1,
  };
  for (const shipping_charge of ["abc", {}, [], NaN, -1, "-5", "  ", true, "12.5abc", "25"]) {
    const parsed = PurchaseOrderQuoteBody.safeParse({ items: [line], shipping_charge });
    assert.equal(
      parsed.success, false, `${JSON.stringify(shipping_charge)} was accepted as a charge`
    );
  }
  assert.equal(
    PurchaseOrderQuoteBody.safeParse({ items: [line], shipping_charge: 12.5 }).success, true
  );
  assert.equal(
    PurchaseOrderQuoteBody.safeParse({ items: [line], shipping_charge: 0 }).success, true
  );
});

// A small order whose fees exceed it does not owe the business money, and a
// negative figure above the Confirm button is not a number to show anybody.
test("the payout never goes below zero", async () => {
  await inPinnedTransaction(async () => {
    const bid = await goldBid();
    assert.ok(bid > 0, "dev has a gold spot to price against");
    const q = await quotes.purchaseOrderQuote({
      items: [{ type: "scrap", metal_id: goldId, pre_melt: 0.0001, purity: 1, unit: "t oz" }],
      shipping_charge: 50,
      payout_method_id: methodIdOf.get("WIRE"),
    });
    assert.ok(q.total < 70, "the fixture is meant to be smaller than its fees");
    assert.equal(q.estimated_payout, 0);
  }, { lock: ORDER_LOCKS });
});
