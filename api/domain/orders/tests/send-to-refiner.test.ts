// sendOrderToSupplier refuses an order it cannot ship.
//
// THE ORDERING THIS PROTECTS. The service attaches the supplier, creates the
// outbound shipment and sets order_sent in one transaction, and only then sends
// the refiner their copy. That order is deliberate and documented in the
// service: the alternative once emailed a refiner their copy as the first
// statement of a transaction that went on to fail, leaving them shipping metal
// against an order nothing recorded. The accepted worst case of this ordering
// is an order marked sent whose email did not arrive.
//
// That is only acceptable while it is visible. Rendering the refiner's copy of
// an order with no address threw a TypeError - SalesOrder declares
// `address: OrderAddressSnapshot.nullable()` and production sales order 55 is exactly
// that, with a supplier attached and order_sent true - so the message failed
// silently, after the record said it had gone.
//
// The guard is now before the transaction, which makes the whole call a no-op.
//
// Nothing is sent: the service takes an optional transport the same way
// sendEmail does, and this passes a recorder.
//
// NOTHING IS COMMITTED, AND THE FIRST VERSION OF THIS FILE ONLY MANAGED THAT BY
// LUCK. It opened its own withTransaction and asserted through that client,
// while sendOrderToSupplier opens its own transaction on its own connection -
// so if the guard had NOT thrown first, the service's writes would have
// committed while this file's rolled back. That is exactly how
// features/shipping/operations/tracking.test.js deleted five dev shipments'
// tracking history. A test whose safety depends on the code under test failing
// early is not a safe test.
//
// shared/testing/pinned-pool.js is what actually contains it: pool.connect and
// pool.query are replaced for the duration, so the service's transaction
// becomes a savepoint inside one that is discarded. The last test checks from
// outside that nothing survived.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import * as orders from "#domain/orders/service.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerService from "#domain/refiners/service.ts";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
} from "#shared/testing/pinned-pool.ts";
import {
  aUser, aProduct, anOrder, anAddress, refinerNamed, refinersByEmail,
} from "#shared/testing/builders/index.ts";

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. SELECT projections, not
// table rows.
type SalesOrderFixture = { id: string; order_number: number };
type SupplierFixture = { id: string };
type Baseline = { order_sent: boolean | null; supplier_id: string | null; outbound: number };

// EVERY SALES ORDER IS BUILT (lane 1). Five separate discoveries lived here,
// each an EXISTS clause hunting a sales order in a particular state - with an
// address, without one, sent, unsent, with a refiner attached - plus a
// `baseline` snapshot taken before anything ran so the escape check could
// measure what this file ADDED rather than what dev already held. That last
// one is the tell: the file had to measure the world because it did not own
// its fixtures. Against built orders the baseline is zero by construction.
//
// The refineries stay NAMED: two seeded rows, one with an email and one
// without, which is the distinction the send path turns on (and is true in
// production - Dillion Gage has no email, which is why the refusal exists).
type Built = { id: string; order_number: number };

const aSalesOrder = async (
  c: PoolClient,
  { address = true, sent = false, refiner = null as string | null } = {}
): Promise<Built> => {
  const owner = await aUser(c);
  const product = await aProduct(c);
  const plan = anOrder(c, owner, {
    direction: "sale",
    status: sent ? "In Transit" : "Pending",
  })
    .withBullion(product, 1, { price: 2600 })
    .withTotals({ total: 2600, items: 2600 });
  const order = address
    ? await plan.withAddress(await anAddress(c, owner))
    : await plan;
  // order_sent IS SET EXPLICITLY EITHER WAY. The column is nullable with no
  // default, so a built order starts NULL - and `assert.equal(order_sent,
  // false)` is a real assertion about the refusal path, not a nullability
  // accident.
  await c.query(
    `UPDATE orders.orders SET order_sent = $2 WHERE id = $1`, [order.id, sent]
  );
  if (refiner) {
    await c.query(
      `INSERT INTO refiners.orders (order_id, refiner_id) VALUES ($1, $2)`,
      [order.id, refiner]
    );
  }
  return { id: order.id, order_number: order.number };
};

afterAll(async () => {
  // Chromium, even though nothing here should ever launch it.
  //
  // With the guard in place this file never reaches the PDF, so this is a
  // no-op - closeBrowser returns immediately when the browser was never
  // started. It is here for the case that matters: proving the guard's test
  // can fail means REMOVING the guard, and the moment you do, the service runs
  // on to build the invoice, puppeteer launches, and node never exits because
  // it is holding the browser handle. That cost an hour of a hung process and
  // eleven orphaned Chromium instances before it was noticed.
  //
  // The lesson generalises: a seam that lets you remove a guard is not enough
  // on its own. The test also has to survive what the code does once the guard
  // is gone.
  await closeBrowser();
  await pool.end();
});

// A transport that would record a message if one were ever sent. Asserting it
// stayed empty is what proves the refusal happened before the email, not that
// the email merely failed.
// Message is the transport's own, so the recorder satisfies Transport rather
// than restating its shape - "restating a structural type is how the seam
// narrows by accident" (providers/emails/nodemailer.ts's own note).
type Message = Parameters<Transport["sendMail"]>[0];

function recorder(): Transport & { sent: Message[] } {
  const sent: Message[] = [];
  return {
    sent,
    sendMail: async (message: Message) => {
      sent.push(message);
      return { messageId: "recorded", accepted: [message.to] };
    },
  };
}

// No executor argument: inside inPinnedTransaction these run on the pinned
// connection, the same one the service uses, so they see its uncommitted writes
// and neither survives the rollback.
const state = async (id: string) => {
  const { rows } = await query(
    `SELECT so.order_sent,
            (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = so.id) AS supplier_id,
            (SELECT count(*)::int FROM shipping.shipments s
              JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
              JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
              WHERE f.order_id = so.id AND s.direction = 'Outbound') AS outbound
       FROM orders.orders so WHERE so.id = $1`,
    [id]
  );
  return rows[0];
};

test("an order with no address is refused, and nothing is written", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const addressless = await aSalesOrder(c, { address: false });
    const supplier = { id: await refinerNamed(c, "Elemetal") };
    const before = await state(addressless.id);

    const mail = recorder();
    await assert.rejects(
      () =>
        orders.sendToRefiner(addressless.id, supplier.id, mail),
      /has no address/,
      "an order with no address was accepted"
    );

    assert.equal(mail.sent.length, 0, "a message was sent for an order with no address");

    const after = await state(addressless.id);
    assert.deepEqual(
      after,
      before,
      "the refusal still attached a supplier, created a shipment or set order_sent"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// THE ASSERTIONS ABOVE MUST BE ABLE TO SEE A WRITE. Comparing a row to itself
// passes whether or not the guard exists if the comparison is blind, so this
// performs the three writes the transaction would have performed and checks
// that `state` reports every one of them. It never goes near the email.
test("those three writes are visible to the assertion that says they did not happen", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const withAddress = await aSalesOrder(client);
    const supplier = { id: await refinerNamed(client, "Elemetal") };
    const before = await state(withAddress.id);

    const engagementId = await refinerService.engagementIdFor(withAddress.id, client);
    await refinerOrders.update(engagementId, { refiner_id: supplier.id }, client);
    await shipmentRepo.create(
      { order_id: withAddress.id, type: "Outbound" },
      client
    );
    await ordersRepo.update(withAddress.id, { order_sent: true }, {}, client);

    const after = await state(withAddress.id);
    assert.equal(after.order_sent, true, "order_sent was not observed");
    assert.equal(after.supplier_id, supplier.id, "the supplier was not observed");
    assert.equal(
      after.outbound,
      before.outbound + 1,
      "the outbound shipment was not observed"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// The property the pin exists for, and the one the first version of this file
// could not have made. Every assertion above reads its own writes and passes
// whether or not they are contained; this is the only one that notices.
//
// AGAINST ZERO, NOT A BASELINE (lane 1). It used to measure the fixture order's
// outbound shipments before the file ran and compare back to that number,
// because "the second test writes against a real dev order and dev already
// carries whatever it carries". The order is built inside the transaction now,
// so nothing about it can survive at all - which is a sharper claim than
// "it carries as much as it did".
test("nothing this file did survived the transaction", async () => {
  let built = "";
  await inPinnedTransaction(async (c: PoolClient) => {
    const order = await aSalesOrder(c);
    built = order.id;
    const supplier = { id: await refinerNamed(c, "Elemetal") };
    const engagementId = await refinerService.engagementIdFor(order.id, c);
    await refinerOrders.update(engagementId, { refiner_id: supplier.id }, c);
    await shipmentRepo.create({ order_id: order.id, type: "Outbound" }, c);
    await ordersRepo.update(order.id, { order_sent: true }, {}, c);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });

  assert.equal(
    await assertNothingEscaped(
      "shipping.shipments s JOIN fulfillments.shipments fs ON fs.shipment_id = s.id " +
        "JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id",
      "f.order_id = $1 AND s.direction = 'Outbound'",
      [built]
    ),
    0,
    "an outbound shipment was committed to the database"
  );
  assert.equal(
    await assertNothingEscaped("orders.orders", "id = $1", [built]),
    0,
    "the built sales order itself was committed"
  );
});

// A SENT ORDER MAY BE RE-SENT TO THE SAME REFINER, AND MAY NOT BE MOVED.
//
// Nothing checked order_sent, so calling this twice overwrote supplier_id with
// no audit trail and no updated_at, created a SECOND outbound shipment, and
// emailed the new refiner their copy - two refiners each holding one order.
//
// A blanket refusal would be wrong: the service's own comment names resending
// as the recovery path for its accepted worst case, an order marked sent whose
// email did not arrive. So both halves are pinned - the resend still works and
// still emails, and it must NOT write again.
test("a sent order cannot be moved to a different refiner", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    // A SENT ORDER ALREADY ATTACHED TO A REFINERY, BUILT (lane 1). The old
    // fixture found one on dev - "dev has six of these" - and the file's own
    // comment about asserting rather than skipping was the right instinct
    // applied to the wrong problem: the state is stated now, so the fixture
    // cannot stop matching.
    const { withEmail, withoutEmail } = await refinersByEmail(client);
    const built = await aSalesOrder(client, { sent: true, refiner: withEmail });
    const order = { ...built, supplier_id: withEmail };
    const other = { id: withoutEmail };

    await assert.rejects(
      () => orders.sendToRefiner(order.id, other.id),
      // The thrown value is `unknown` to TypeScript, so the predicate says
      // what it expects of it. The message and status are what the assertion
      // is about, and naming them here is the same claim in a place the
      // compiler can check.
      // The thrown value is `unknown` to TypeScript, so the predicate says
      // what it expects of it. A DOMAIN ERROR CARRIES A KIND, NOT A STATUS
      // (D214 item 11) - the middleware maps `conflict` to 409.
      (err: unknown) => {
        const e = err as { kind?: string; message?: string };
        assert.equal(e.kind, "conflict", `expected a conflict, got ${e.kind}`);
        assert.match(String(e.message), /already been sent/);
        return true;
      }
    );

    const after = (
      await client.query(
        `SELECT refiner_id AS supplier_id FROM refiners.orders WHERE order_id = $1`, [order.id])
    ).rows[0];
    assert.equal(after.supplier_id, order.supplier_id, "the refiner was changed anyway");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("re-sending to the same refiner writes nothing new", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { withEmail } = await refinersByEmail(client);
    const built = await aSalesOrder(client, { sent: true, refiner: withEmail });
    const order = { ...built, supplier_id: withEmail };

    const before = Number(
      (
        await client.query(
          `SELECT count(*)::int n FROM shipping.shipments s
             JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1 AND s.direction = 'Outbound'`,
          [order.id]
        )
      ).rows[0].n
    );

    const sent: unknown[] = [];
    await orders.sendToRefiner(
      order.id,
      order.supplier_id,
      { sendMail: async (m) => { sent.push(m); return { messageId: "test" }; } }
    );

    const after = Number(
      (
        await client.query(
          `SELECT count(*)::int n FROM shipping.shipments s
             JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1 AND s.direction = 'Outbound'`,
          [order.id]
        )
      ).rows[0].n
    );
    assert.equal(after, before, "a resend created another outbound shipment");
    assert.equal(sent.length, 1, "the resend did not send the refiner their copy");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// THE REFINER'S COPY HAS NEVER ARRIVED, AND THIS IS WHY.
//
// A refiner has no top-level email in either schema - both projections nest
// name/email/phone/enabled under `organization`. So `supplier.email` was
// undefined and sendEmail got `to: undefined`, which nodemailer refuses. It
// threw AFTER the transaction committed, which is the accepted worst case this
// function's comment describes: an order marked sent whose email did not
// arrive. Permanently, for every sales order sent to a refiner.
//
// tsc could not see it: repo.js resolved through a dynamic index, which erases
// every export to `any`, so `email: string` accepted undefined.
test("the refiner's copy goes to the organization's address, not a field that does not exist", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const order = await aSalesOrder(client);
    // A refinery that DOES have an email, so the send is reached.
    // refinersByEmail refuses if the seed ever stops having one of each, which
    // is what the two "this would prove nothing" guards were watching for.
    const withEmail = { id: (await refinersByEmail(client)).withEmail };

    const sent: Message[] = [];
    await orders.sendToRefiner(
      order.id,
      withEmail.id,
      { sendMail: async (m: Message) => { sent.push(m); return { messageId: "test" }; } }
    );

    assert.equal(sent.length, 1, "the refiner was not sent their copy");
    assert.ok(sent[0].to, `the recipient was ${JSON.stringify(sent[0].to)}`);
    assert.match(String(sent[0].to), /@/, "the recipient is not an address");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// A refiner with no email is refused BEFORE the transaction, not after it.
// Dillion Gage is exactly that in production - is_active false, no email - and
// sending metal against an order nobody was told about is the failure the
// record-first-email-second ordering exists to prevent.
test("a refiner with no email is refused before anything is written", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const order = await aSalesOrder(client);
    const noEmail = { id: (await refinersByEmail(client)).withoutEmail };

    await assert.rejects(
      () => orders.sendToRefiner(
        order.id,
        noEmail.id,
        { sendMail: async () => { throw new Error("must not be reached"); } }
      ),
      (err: unknown) => {
        const e = err as { kind?: string; message?: string };
        assert.equal(e.kind, "invalid", `expected an invalid refusal, got ${e.kind}`);
        assert.match(String(e.message), /no email address/);
        return true;
      }
    );

    const after = (
      await client.query(
        `SELECT o.order_sent,
                (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = o.id) AS supplier_id
           FROM orders.orders o WHERE o.id = $1`, [order.id])
    ).rows[0];
    assert.equal(after.order_sent, false, "the order was marked sent anyway");
    assert.equal(after.supplier_id, null, "the refiner was attached anyway");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
