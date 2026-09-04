// A CUSTOMER PLACES THEIR OWN SALE ORDER, over real HTTP, through the route
// the buy checkout actually posts to.
//
// *** WHAT THIS PINS. *** `POST /api/sales_orders/create_sales_order` was
// `requireAdmin` (Jacob's call, 26 August: "the buy flow is not open to
// customers until the refactor lands"), so the customer buy checkout ran the
// whole way - basket, address, delivery service, payment method, Stripe
// element - and 403'd on the last click. It is `requireUser` now, and the
// three rules that decide WHO MAY PLACE WHAT were already one layer down and
// stayed there:
//
//   1. a signed-in customer places THEIR OWN checkout            -> 200
//   2. somebody else's checkout is not theirs to place           -> 403
//      (createOrderFromCheckout, unless the caller is an admin)
//   3. a VISITOR may shop and may not buy (ruling 63)            -> 403
//      (place() -> checkoutService.assertRealAccount)
//
// NO OUTSIDE WORLD IS REACHED, and that is what makes an HTTP-level placement
// testable at all - there is no seam here to inject a stub `World` through.
// The customer's credit covers the basket, so `placeSale` prices
// post_charges_amount at 0, opens no Stripe intent and calls no `authorize`;
// and unlike the purchase side, the sale side sends no confirmation email.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import {
  aProduct, aUser, aVisitor, anAddress, paymentMethodId, saleServiceId,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const asCaller = (u: { id: string; name: string | null; email: string | null }) =>
  ({ id: u.id, name: u.name, email: u.email, role: "user" });

// One product priced well under the credit balance below, a basket holding it,
// and a checkout row with the three columns placement asserts on. Returns the
// checkout's own id - the whole body of the create (ruling 43).
async function aReadySaleCheckout(
  c: PoolClient, buyer: { id: string; name: string | null; email: string | null }
): Promise<string> {
  const address = await anAddress(c, buyer);
  const product = await aProduct(c, { metal: "Gold", content: 0.001, ask_premium: 1 });

  const basket = await as(buyer, () =>
    request(app).put("/api/checkout/items").query({ direction: "sale" }).send({
      items: [{ bullion_id: product.id, quantity: 1 }],
    })
  );
  assert.equal(basket.status, 200, basket.text);

  const carrier_service_id = await saleServiceId(c);
  const payment_method_id = await paymentMethodId(c, "CARD", "sale");
  const patched = await as(buyer, () =>
    request(app).patch("/api/checkout").send({
      direction: "sale",
      recipient_address_id: address.id,
      carrier_service_id,
      payment_method_id,
    })
  );
  assert.equal(patched.status, 200, patched.text);
  return patched.body.id as string;
}

test("a signed-in customer places their own sale order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // A balance that covers the basket several times over. Credit is not a
    // choice (ruling 47) - it applies because it is there - so the order
    // prices to nothing left for a card and no Stripe call is made.
    const buyer = asCaller(await aUser(c, { funds: 1_000_000 }));
    const checkout_id = await aReadySaleCheckout(c, buyer);

    const placed = await as(buyer, () =>
      request(app).post("/api/sales_orders/create_sales_order").send({ checkout_id })
    );

    assert.equal(placed.status, 200, placed.text);
    assert.equal(placed.body.order.direction, "sale");
    assert.equal(placed.body.order.user_id, buyer.id, "the order belongs to somebody else");
    assert.equal(placed.body.items.length, 1);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] });
});

test("a customer cannot place another customer's checkout", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = asCaller(await aUser(c, { funds: 1_000_000 }));
    const stranger = asCaller(await aUser(c, { funds: 1_000_000 }));
    const checkout_id = await aReadySaleCheckout(c, owner);

    const placed = await as(stranger, () =>
      request(app).post("/api/sales_orders/create_sales_order").send({ checkout_id })
    );

    assert.equal(placed.status, 403, placed.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] });
});

// requireUser answers a VISITOR - that is what lets one shop at all - so the
// refusal has to come from the use case, and it does. Losing this is how an
// order gets placed for an account nobody can be contacted through.
test("a visitor may shop and may not buy", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = asCaller(await aVisitor(c, { funds: 1_000_000 }));
    const checkout_id = await aReadySaleCheckout(c, visitor);

    const placed = await as(visitor, () =>
      request(app).post("/api/sales_orders/create_sales_order").send({ checkout_id })
    );

    assert.equal(placed.status, 403, placed.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] });
});
