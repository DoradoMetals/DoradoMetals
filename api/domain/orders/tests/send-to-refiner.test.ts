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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import query from "#shared/db/query.ts";
import * as sendToRefiner from "#domain/orders/send-to-refiner.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. SELECT projections, not
// table rows.
type SalesOrderFixture = { id: string; order_number: number };
type SupplierFixture = { id: string };
type Baseline = { order_sent: boolean | null; supplier_id: string | null; outbound: number };

let addressless: SalesOrderFixture;
let withAddress: SalesOrderFixture;
let supplier: SupplierFixture;
let baseline: Baseline;

before(async () => {
  // Through the shared executor with no client, never pool.query: lint:db
  // enforces that everywhere, and it is the rule that makes the pinned pool
  // work at all - one place to intercept.
  const rows = await outside<SalesOrderFixture>(
    `SELECT id, number AS order_number FROM orders.orders o
      WHERE direction = 'sale'
        AND NOT EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = o.id)
      ORDER BY number LIMIT 1`
  );
  addressless = rows[0];
  assert.ok(
    addressless,
    "dev has no sales order without an address - the case production has is untested"
  );

  const withAddr = await outside<SalesOrderFixture>(
    `SELECT id, number AS order_number FROM orders.orders o
      WHERE direction = 'sale'
        AND EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = o.id)
      ORDER BY number LIMIT 1`
  );
  withAddress = withAddr[0];
  assert.ok(withAddress, "dev has no sales order with an address");

  const suppliers = await outside<SupplierFixture>(`SELECT id FROM refiners.refiners LIMIT 1`);
  supplier = suppliers[0];
  assert.ok(supplier, "dev has no supplier to send an order to");

  // Taken before anything runs, so the escape check measures what THIS file
  // added rather than what dev already held.
  const [row] = await outside<{ order_sent: boolean | null; supplier_id: string | null }>(
    `SELECT o.order_sent,
            (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = o.id) AS supplier_id
       FROM orders.orders o WHERE o.id = $1`,
    [withAddress.id]
  );
  const [ship] = await outside<{ n: number }>(
    `SELECT count(*)::int AS n FROM shipping.shipments s
       JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE f.order_id = $1 AND s.direction = 'Outbound'`,
    [withAddress.id]
  );
  baseline = {
    order_sent: row.order_sent,
    supplier_id: row.supplier_id,
    outbound: ship.n,
  };
});

after(async () => {
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
  await inPinnedTransaction(async () => {
    const before = await state(addressless.id);

    const mail = recorder();
    await assert.rejects(
      () =>
        sendToRefiner.sendOrderToRefiner(
          { order: { id: addressless.id }, spots: [], supplier_id: supplier.id },
          mail
        ),
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
  }, { lock: LOCKS.ORDERS });
});

// THE ASSERTIONS ABOVE MUST BE ABLE TO SEE A WRITE. Comparing a row to itself
// passes whether or not the guard exists if the comparison is blind, so this
// performs the three writes the transaction would have performed and checks
// that `state` reports every one of them. It never goes near the email.
test("those three writes are visible to the assertion that says they did not happen", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const before = await state(withAddress.id);

    const engagementId = await refinerOrders.ensureForOrder(withAddress.id, client);
    await refinerOrders.update(engagementId, { refiner_id: supplier.id }, client);
    await shipmentRepo.create(
      { sales_order_id: withAddress.id, type: "Outbound" },
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
  }, { lock: LOCKS.ORDERS });
});

// The property the pin exists for, and the one the first version of this file
// could not have made. Every assertion above reads its own writes and passes
// whether or not they are contained; this is the only one that notices.
//
// Measured against a baseline rather than zero, because the second test writes
// against a real dev order and dev already carries whatever it carries.
test("nothing this file did survived the transaction", async () => {
  assert.equal(
    await assertNothingEscaped(
      "shipping.shipments s JOIN fulfillments.shipments fs ON fs.shipment_id = s.id " +
        "JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id",
      "f.order_id = $1 AND s.direction = 'Outbound'",
      [withAddress.id]
    ),
    baseline.outbound,
    "an outbound shipment was committed to dev"
  );

  const [row] = await outside<{ order_sent: boolean | null; supplier_id: string | null }>(
    `SELECT o.order_sent,
            (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = o.id) AS supplier_id
       FROM orders.orders o WHERE o.id = $1`,
    [withAddress.id]
  );
  assert.equal(row.order_sent, baseline.order_sent, "order_sent was committed to dev");
  assert.equal(row.supplier_id, baseline.supplier_id, "a supplier was committed to dev");
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
    const order = (
      await client.query(
        `SELECT o.id, o.number AS order_number, ro.refiner_id AS supplier_id
           FROM orders.orders o
           JOIN refiners.orders ro ON ro.order_id = o.id
          WHERE o.direction = 'sale' AND o.order_sent = true AND ro.refiner_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = o.id) LIMIT 1`
      )
    ).rows[0];
    // ASSERTED, NOT SKIPPED. A silent `return` here would make this test pass
    // for ever if the dev data stopped matching, which is the failure mode
    // where a green suite proves nothing. Dev has six of these.
    assert.ok(order, "dev has no sent order with a supplier and an address to test against");

    const other = (
      await client.query(
        `SELECT id FROM refiners.refiners WHERE id <> $1 LIMIT 1`,
        [order.supplier_id]
      )
    ).rows[0];
    assert.ok(other, "dev has only one supplier, so this cannot be tested");

    await assert.rejects(
      () => sendToRefiner.sendOrderToRefiner({ order: { id: order.id }, spots: [], supplier_id: other.id }),
      // The thrown value is `unknown` to TypeScript, so the predicate says
      // what it expects of it. The message and status are what the assertion
      // is about, and naming them here is the same claim in a place the
      // compiler can check.
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string };
        assert.equal(e.statusCode, 409, `expected 409, got ${e.statusCode}`);
        assert.match(String(e.message), /already been sent/);
        return true;
      }
    );

    const after = (
      await client.query(
        `SELECT refiner_id AS supplier_id FROM refiners.orders WHERE order_id = $1`, [order.id])
    ).rows[0];
    assert.equal(after.supplier_id, order.supplier_id, "the refiner was changed anyway");
  }, { lock: LOCKS.ORDERS });
});

test("re-sending to the same refiner writes nothing new", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const order = (
      await client.query(
        `SELECT o.id, ro.refiner_id AS supplier_id
           FROM orders.orders o
           JOIN refiners.orders ro ON ro.order_id = o.id
          WHERE o.direction = 'sale' AND o.order_sent = true AND ro.refiner_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = o.id) LIMIT 1`
      )
    ).rows[0];
    assert.ok(order, "dev has no sent order with a supplier and an address to test against");

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
    await sendToRefiner.sendOrderToRefiner(
      { order: { id: order.id }, spots: [], supplier_id: order.supplier_id },
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
  }, { lock: LOCKS.ORDERS });
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
    const order = (
      await client.query(
        `SELECT s.id, s.number AS order_number,
                (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = s.id) AS supplier_id
           FROM orders.orders s
          WHERE s.direction = 'sale' AND s.order_sent = false
            AND EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = s.id) LIMIT 1`
      )
    ).rows[0];
    assert.ok(order, "dev has no unsent sales order with an address");

    // A refiner that DOES have an address, so the send is reached.
    const withEmail = (
      await client.query(
        `SELECT r.id FROM refiners.refiners r
           JOIN organizations.organizations o ON o.id = r.organization_id
          WHERE o.email IS NOT NULL AND o.email <> '' LIMIT 1`
      )
    ).rows[0];
    assert.ok(withEmail, "dev has no refiner with an email - this would prove nothing");

    const sent: Message[] = [];
    await sendToRefiner.sendOrderToRefiner(
      { order: { id: order.id }, spots: [], supplier_id: withEmail.id },
      { sendMail: async (m: Message) => { sent.push(m); return { messageId: "test" }; } }
    );

    assert.equal(sent.length, 1, "the refiner was not sent their copy");
    assert.ok(sent[0].to, `the recipient was ${JSON.stringify(sent[0].to)}`);
    assert.match(String(sent[0].to), /@/, "the recipient is not an address");
  }, { lock: LOCKS.ORDERS });
});

// A refiner with no email is refused BEFORE the transaction, not after it.
// Dillion Gage is exactly that in production - is_active false, no email - and
// sending metal against an order nobody was told about is the failure the
// record-first-email-second ordering exists to prevent.
test("a refiner with no email is refused before anything is written", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const order = (
      await client.query(
        `SELECT s.id,
                (SELECT ro.refiner_id FROM refiners.orders ro WHERE ro.order_id = s.id) AS supplier_id
           FROM orders.orders s
          WHERE s.direction = 'sale' AND s.order_sent = false
            AND EXISTS (SELECT 1 FROM orders.addresses a WHERE a.order_id = s.id) LIMIT 1`
      )
    ).rows[0];
    assert.ok(order, "dev has no unsent sales order with an address");

    const noEmail = (
      await client.query(
        `SELECT r.id FROM refiners.refiners r
           JOIN organizations.organizations o ON o.id = r.organization_id
          WHERE o.email IS NULL OR o.email = '' LIMIT 1`
      )
    ).rows[0];
    assert.ok(noEmail, "dev has no refiner without an email - this would prove nothing");

    await assert.rejects(
      () => sendToRefiner.sendOrderToRefiner(
        { order: { id: order.id }, spots: [], supplier_id: noEmail.id },
        { sendMail: async () => { throw new Error("must not be reached"); } }
      ),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string };
        assert.equal(e.statusCode, 422, `expected 422, got ${e.statusCode}`);
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
    assert.equal(after.supplier_id, order.supplier_id, "the refiner was attached anyway");
  }, { lock: LOCKS.ORDERS });
});
