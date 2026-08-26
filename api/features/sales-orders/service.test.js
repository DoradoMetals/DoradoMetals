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
// an order with no address threw a TypeError - SalesOrderWire declares
// `address: AddressOnOrder.nullable()` and production sales order 55 is exactly
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
import pool from "#db";
import query from "#shared/db/query.js";
import * as service from "#features/sales-orders/service.js";
import * as salesOrderRepo from "#features/sales-orders/repo.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import { closeBrowser } from "#features/pdf/render/browser.ts";
import { LOCKS } from "#shared/testing/locks.js";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.js";

let addressless;
let withAddress;
let supplier;
let baseline;

before(async () => {
  // Through the shared executor with no client, never pool.query: lint:db
  // enforces that everywhere, and it is the rule that makes the pinned pool
  // work at all - one place to intercept.
  const rows = await outside(
    `SELECT id, order_number FROM exchange.sales_orders WHERE address_id IS NULL ORDER BY order_number LIMIT 1`
  );
  addressless = rows[0];
  assert.ok(
    addressless,
    "dev has no sales order without an address - the case production has is untested"
  );

  const withAddr = await outside(
    `SELECT id, order_number FROM exchange.sales_orders WHERE address_id IS NOT NULL ORDER BY order_number LIMIT 1`
  );
  withAddress = withAddr[0];
  assert.ok(withAddress, "dev has no sales order with an address");

  const suppliers = await outside(`SELECT id FROM exchange.suppliers LIMIT 1`);
  supplier = suppliers[0];
  assert.ok(supplier, "dev has no supplier to send an order to");

  // Taken before anything runs, so the escape check measures what THIS file
  // added rather than what dev already held.
  const [row] = await outside(
    `SELECT order_sent, supplier_id FROM exchange.sales_orders WHERE id = $1`,
    [withAddress.id]
  );
  const [ship] = await outside(
    `SELECT count(*)::int AS n FROM exchange.shipments
      WHERE sales_order_id = $1 AND type = 'Outbound'`,
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
function recorder() {
  const sent = [];
  return {
    sent,
    sendMail: async (message) => {
      sent.push(message);
      return { messageId: "recorded", accepted: [message.to] };
    },
  };
}

// No executor argument: inside inPinnedTransaction these run on the pinned
// connection, the same one the service uses, so they see its uncommitted writes
// and neither survives the rollback.
const state = async (id) => {
  const { rows } = await query(
    `SELECT so.order_sent, so.supplier_id,
            (SELECT count(*)::int FROM exchange.shipments s
              WHERE s.sales_order_id = so.id AND s.type = 'Outbound') AS outbound
       FROM exchange.sales_orders so WHERE so.id = $1`,
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
        service.sendOrderToSupplier(
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
  await inPinnedTransaction(async (client) => {
    const before = await state(withAddress.id);

    await salesOrderRepo.attachSupplierToOrder(withAddress.id, supplier.id, client);
    await shipmentRepo.create(
      { sales_order_id: withAddress.id, type: "Outbound" },
      client
    );
    await salesOrderRepo.updateOrderSent(withAddress.id, client);

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
      "exchange.shipments",
      "sales_order_id = $1 AND type = 'Outbound'",
      [withAddress.id]
    ),
    baseline.outbound,
    "an outbound shipment was committed to dev"
  );

  const [row] = await outside(
    `SELECT order_sent, supplier_id FROM exchange.sales_orders WHERE id = $1`,
    [withAddress.id]
  );
  assert.equal(row.order_sent, baseline.order_sent, "order_sent was committed to dev");
  assert.equal(row.supplier_id, baseline.supplier_id, "a supplier was committed to dev");
});
