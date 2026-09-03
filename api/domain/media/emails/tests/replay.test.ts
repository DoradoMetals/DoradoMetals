// The two email routes, over real HTTP. FOUND: both routes (requireUser) took the RECIPIENT from the request body - any signed-in account could mail FROM the business's domain TO any address it named, with a PDF it also supplied (open relay, phishing template, unrecoverable reputation damage).
// FIX: the recipient is resolved by the controller from the STORED order, gated by entitlement (owner or admin only) - naming someone else's order id no longer mails them.
// NO MAIL LEAVES THIS SUITE: sendEmail refuses to build the real transport when NODE_ENV=test; the last test proves that refusal is what stops it, rather than assuming it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
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
      // /purchase_order_created is deleted - the confirmation is now sent server-side after the commit, so the redirect attack this file guards is unreachable there. What remains guards the one route a browser can still trigger.
      for (const path of ["purchase_order_priced"]) {
        const res = await request(app).post(`/api/emails/${path}`).send({});
        assert.ok([401, 403].includes(res.status), `${path} answered ${res.status}`);
      }
    });
  });
});

// Sent as the attack was: a real order id, attacker's address in every field that used to be read. This test does NOT discriminate the fix on its own - reverting it and rerunning still passes (both paths hit the transport guard and fail the same way).
// What actually proves the fix is the pair below (unknown order id -> 404, stranger -> 403), checked against reverted code. Kept because it pins the response never NAMING the supplied address.
test("an address in the body cannot redirect the order confirmation", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      // The confirmation route is GONE - asserted here rather than deleted, because "the attack surface no longer exists" is the strongest form this test can take.
      const gone = await request(app)
        .post("/api/emails/purchase_order_created")
        .send({ purchaseOrder: { id: order.id } });
      assert.equal(gone.status, 404, "the browser-triggered confirmation route is back");

      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({
          order: {
            id: order.id,
            number: 1,
            user: { user_email: ATTACKER_ADDRESS, user_name: "whoever" },
          },
          order_spots: [],
          spot_prices: [],
        });

      // Whatever happens, it must not be delivery to the attacker - the transport guard refuses the send, so what's asserted is that the response never reports having mailed the supplied address.
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(ATTACKER_ADDRESS),
        "the response named the attacker's address"
      );
      // Not evidence of the fix (see header) - a 200 here would mean the route reported success while the transport is refused under test, its own problem.
      assert.notEqual(res.status, 200, "the route reported a successful send");
    });
  });
});

// Same claim, other route (field was simply `email`) - same limitation as above; the discriminating tests follow.
test("an email field in the body cannot redirect the pricing notice", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({
          order: { id: order.id, number: 1, user: {} },
          order_spots: [],
          spot_prices: [],
          email: ATTACKER_ADDRESS,
        });
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(ATTACKER_ADDRESS),
        "the response named the attacker's address"
      );
      assert.notEqual(res.status, 200, "the route reported a successful send");
    });
  });
});

// One of the two tests that actually prove the fix: a 403 is only reachable if the controller resolved the order and compared its owner to the caller. Fails against reverted code.
// A customer must not trigger mail about someone else's order. The recipient is the rightful owner, so this isn't a leak - it's a way to send unwanted mail from a domain they trust.
test("a stranger cannot trigger mail about someone else's order", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order: { id: order.id, number: 1, user: {} }, order_spots: [], spot_prices: [] });
      assert.equal(res.status, 403, `a stranger got ${res.status} for another user's order`);
    });
  });
});

// The other one: 400/404 are only reachable through the lookup; without it the request proceeds to build a PDF and send. Fails against reverted code.
test("an unknown or missing order id is refused before anything is built", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const missing = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order: { number: 1 }, order_spots: [], spot_prices: [] });
      assert.equal(missing.status, 400, `a body with no order id answered ${missing.status}`);

      const unknown = await request(app)
        .post("/api/emails/purchase_order_priced")
        .send({ order: { id: randomUUID(), number: 1 }, order_spots: [], spot_prices: [] });
      assert.equal(unknown.status, 404, `an unknown order answered ${unknown.status}`);
    });
  });
});

// The safety net itself: everything above depends on no real mail leaving, so prove the guard is what prevents it rather than trusting it.
test("the real mail transport refuses to exist during this run", async () => {
  const { sendEmail } = await import("#providers/emails/nodemailer.ts");
  await assert.rejects(
    () => sendEmail({ to: ATTACKER_ADDRESS, subject: "x", html: "x" }),
    /refusing to build the real mail transport/,
    "the suite could have sent real mail"
  );
});
