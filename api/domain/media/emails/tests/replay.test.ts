// The two email routes, over real HTTP.
//
// WHAT THIS FOUND. Both routes are requireUser and both took the RECIPIENT from
// the request body - `purchaseOrder.user.user_email` on one, a bare `email`
// field on the other. So any signed-in account could send mail FROM the
// business's own domain TO any address it named, with the subject "Your Order
// Has Been Placed!" and a PDF attachment whose contents it also supplied.
//
// That is an open relay and a ready-made phishing template. It also spends the
// sending domain's reputation, which is not recoverable by deploying a fix.
//
// The recipient is now resolved by the controller from the STORED order, and
// the caller has to be entitled to it - an admin may send on a customer's
// behalf, anyone else only about their own order. Otherwise naming somebody
// else's order id would be a way to mail that customer at will.
//
// NO MAIL LEAVES THIS SUITE, STRUCTURALLY. sendEmail refuses to build the real
// transport when NODE_ENV=test, so a route that got as far as sending would
// throw rather than deliver. That is asserted here rather than assumed: the
// last test proves the refusal is what stops it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. SELECT projections, not
// table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; user_id: string; email: string | null };

let owner: UserFixture;
let stranger: UserFixture;
let order: OrderFixture;

before(async () => {
  const orders = await outside<OrderFixture>(
    `SELECT po.id, po.user_id, u.email
     FROM exchange.purchase_orders po
     JOIN exchange.users u ON u.id = po.user_id
     LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no purchase order with a user - this suite proves nothing");

  const owners = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  owner = owners[0];

  const others = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users
     WHERE id <> $1 AND role IS DISTINCT FROM 'admin' LIMIT 1`,
    [order.user_id]
  );
  stranger = others[0];
  assert.ok(stranger, "dev has no second non-admin user - the relay test is untestable");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const ATTACKER_ADDRESS = "attacker@example.invalid";

test("both routes refuse an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      // ONE ROUTE, NOT TWO, SINCE D91. /purchase_order_created is deleted:
      // the confirmation is sent by the server at order creation, after the
      // commit, from its own read. The redirect attack this file was written
      // about is UNREACHABLE on that path now - there is no body to put an
      // address in - so what these tests guard is the one send a browser can
      // still trigger, which shares recipientFor with the one that left.
      for (const path of ["purchase_order_priced"]) {
        const res = await request(app).post(`/api/emails/${path}`).send({});
        assert.ok([401, 403].includes(res.status), `${path} answered ${res.status}`);
      }
    });
  });
});

// Sent as the attack was: a real order id, an attacker's address in every field
// that used to be read.
//
// THIS TEST DOES NOT DISCRIMINATE ON ITS OWN, and saying so is the point.
// Reverting the fix and re-running showed it still passing - because with the
// fix the controller resolves the real address and proceeds to send, and
// without it the body's address is used and it also proceeds to send, and BOTH
// then hit the transport guard and fail. Same status either way.
//
// What actually proves the fix is the pair below: an unknown order id answering
// 404 and a stranger answering 403 are only possible if the controller looked
// the order up. Those two failed against the reverted code, checked.
//
// It is kept because it pins the response never NAMING the supplied address,
// which is worth keeping true, and because a future change that makes the send
// observable will make this assertion real.
test("an address in the body cannot redirect the order confirmation", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      // The confirmation route is GONE (D91) - asserted here rather than
      // deleted, because "the attack surface no longer exists" is the
      // strongest form this test can take, and a route that came back would
      // come back with the body-supplied recipient.
      const gone = await request(app)
        .post("/api/emails/purchase_order_created")
        .send({ order_id: order.id });
      assert.equal(gone.status, 404, "the browser-triggered confirmation route is back");

      // THE BODY IS ONE ID NOW (D214 item 12), so there is no recipient-shaped
      // field left to supply: a document naming one is refused outright.
      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({
          order_id: order.id,
          user: { user_email: ATTACKER_ADDRESS, user_name: "whoever" },
        });

      // Whatever happens next, it must not be a delivery to the attacker. The
      // send itself is refused by the transport guard, so anything but a 2xx
      // that claims success is acceptable here; what is asserted is that the
      // response never reports having mailed the supplied address.
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(ATTACKER_ADDRESS),
        "the response named the attacker's address"
      );
      // Not evidence of the fix - see the header. A 200 here would mean the
      // route reported success while the real transport is refused under test,
      // which would be its own problem.
      assert.notEqual(res.status, 200, "the route reported a successful send");
    });
  });
});

// The same claim on the other route, where the field was simply `email`. Same
// limitation as above; the discriminating tests follow. (The route was
// /purchase_order_offer_accepted until the offers went - same send, priced
// name.)
test("an email field in the body cannot redirect the pricing notice", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order_id: order.id, email: ATTACKER_ADDRESS });
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(ATTACKER_ADDRESS),
        "the response named the attacker's address"
      );
      assert.notEqual(res.status, 200, "the route reported a successful send");
    });
  });
});

// ONE OF THE TWO TESTS THAT ACTUALLY PROVE THE FIX. A 403 is only reachable if
// the controller resolved the order from the database and compared its owner to
// the caller. Fails against the reverted code.
//
// A customer must not be able to trigger mail about an order that is not
// theirs. The recipient would be the rightful owner, so this is not a leak -
// it is a way to send someone unwanted mail from a domain they trust.
test("a stranger cannot trigger mail about someone else's order", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order_id: order.id });
      assert.equal(res.status, 403, `a stranger got ${res.status} for another user's order`);
    });
  });
});

// THE OTHER ONE. 400 and 404 are only reachable through the lookup; without it
// the request proceeds to build a PDF and send. Fails against the reverted code.
test("an unknown or missing order id is refused before anything is built", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const missing = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({});
      assert.equal(missing.status, 400, `a body with no order id answered ${missing.status}`);

      const unknown = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order_id: randomUUID() });
      assert.equal(unknown.status, 404, `an unknown order answered ${unknown.status}`);
    });
  });
});

// THE SAFETY NET ITSELF. Everything above depends on no real mail leaving, so
// prove the guard is what prevents it rather than trusting that it does.
test("the real mail transport refuses to exist during this run", async () => {
  const { sendEmail } = await import("#providers/emails/nodemailer.ts");
  await assert.rejects(
    () => sendEmail({ to: ATTACKER_ADDRESS, subject: "x", html: "x" }),
    /refusing to build the real mail transport/,
    "the suite could have sent real mail"
  );
});
