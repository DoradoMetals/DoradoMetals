// D97: THE ESTIMATED PAYOUT COMES FROM THE SERVER.
//
// The checkout's headline figure above "Confirm and Place Order" was
//
//   (quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)
//
// and `+` binds tighter than `??`, so that parses as
// `shippingCost ?? (0 + paymentCost)`. Whichever deduction the `??` selected,
// THE OTHER WAS SILENTLY DISCARDED - the two could never both apply. With a
// service selected, which is the normal case, the payout fee vanished and the
// number read high, while the Shipping and Payout Method Fee rows printed
// directly beneath it said otherwise.
//
// These pin the server's answer, not the component's. Ruling D82: the frontend
// computes no money, so the arithmetic being right here is the whole fix.
import test from "node:test";
import assert from "node:assert/strict";
import * as quotes from "#features/quotes/service.ts";
import query from "#shared/db/query.js";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";

// A scrap line prices from the body's own declared content, so this needs no
// product row and no fixture - which is what makes it safe to assert exact
// money against.
const goldGram = { type: "scrap", data: { metal: "Gold", content: 1 } };

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
    const bare = await quotes.purchaseOrderQuote({ items: [goldGram] });

    const both = await quotes.purchaseOrderQuote({
      items: [goldGram],
      shipping_charge: 12.5,
      payout_method: "WIRE",
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
  });
});

test("a quote with no choices made yet deducts nothing", async () => {
  await inPinnedTransaction(async () => {
    const q = await quotes.purchaseOrderQuote({ items: [goldGram] });
    assert.equal(q.shipping_charge, 0);
    assert.equal(q.payout_charge, 0);
    assert.equal(q.estimated_payout, q.total);
  });
});

test("a free payout method deducts nothing, and says so rather than omitting it", async () => {
  await inPinnedTransaction(async () => {
    for (const method of ["ACH", "ECHECK", "DORADO_ACCOUNT"]) {
      const q = await quotes.purchaseOrderQuote({ items: [goldGram], payout_method: method });
      assert.equal(q.payout_charge, 0, `${method} is free`);
      assert.equal(q.estimated_payout, q.total);
    }
  });
});

// Ruling 10 - ids in, data out. The fee is resolved from the METHOD NAME; a
// caller cannot send a number and be believed.
test("the payout fee is not taken from the body", async () => {
  await inPinnedTransaction(async () => {
    const q = await quotes.purchaseOrderQuote({
      items: [goldGram],
      payout_method: "WIRE",
      payout_charge: 0,
      cost: 0,
    });
    assert.equal(q.payout_charge, 20, "a fee sent in the body was believed");
  });
});

test("a payout method the business does not pay by is refused, not priced as free", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => quotes.purchaseOrderQuote({ items: [goldGram], payout_method: "CHEQUE_BY_PIGEON" }),
      (err: { statusCode?: number; message: string }) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /is not a payout method/);
        return true;
      }
    );
  });
});

test("a shipping charge that is not a charge is refused rather than coerced to zero", async () => {
  await inPinnedTransaction(async () => {
    for (const shipping_charge of ["abc", {}, [], NaN, -1, "-5", "  ", true, "12.5abc"]) {
      await assert.rejects(
        () => quotes.purchaseOrderQuote({ items: [goldGram], shipping_charge }),
        (err: { statusCode?: number }) => {
          assert.equal(err.statusCode, 400, `${JSON.stringify(shipping_charge)} was accepted`);
          return true;
        }
      );
    }
  });
});

// A small order whose fees exceed it does not owe the business money, and a
// negative figure above the Confirm button is not a number to show anybody.
test("the payout never goes below zero", async () => {
  await inPinnedTransaction(async () => {
    const bid = await goldBid();
    assert.ok(bid > 0, "dev has a gold spot to price against");
    const q = await quotes.purchaseOrderQuote({
      items: [{ type: "scrap", data: { metal: "Gold", content: 0.0001 } }],
      shipping_charge: 50,
      payout_method: "WIRE",
    });
    assert.ok(q.total < 70, "the fixture is meant to be smaller than its fees");
    assert.equal(q.estimated_payout, 0);
  });
});
