import { test, beforeAll } from "vitest";
import assert from "node:assert/strict";
import * as quotes from "#domain/quotes/service.ts";
import { PurchaseOrderQuoteBody } from "@dorado/contracts";
import query from "#shared/db/query.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCKS = [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES];

let goldId: string;
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

    assert.equal(
      Number(both.estimated_payout.toFixed(4)),
      Number((both.total - 32.5).toFixed(4)),
      "one of the two deductions went missing, which is exactly D97"
    );
    assert.ok(
      both.estimated_payout < bare.total - 12.5,
      "the payout fee did not come off"
    );
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("a quote with no choices made yet deducts nothing", async () => {
  await inPinnedTransaction(async () => {
    const q = await quotes.purchaseOrderQuote({ items: [goldOunce()] });
    assert.equal(q.shipping_charge, 0);
    assert.equal(q.payout_charge, 0);
    assert.equal(q.estimated_payout, q.total);
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

test("the payout fee is not taken from the body", () => {
  const withAFee = PurchaseOrderQuoteBody.safeParse({
    items: [{ type: "scrap", metal_id: "00000000-0000-4000-8000-000000000000",
              pre_melt: 1, purity: 1 }],
    payout_charge: 0,
    cost: 0,
  });
  assert.equal(withAFee.success, false, "a fee sent in the body was accepted");
});

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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});

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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCKS });
});
