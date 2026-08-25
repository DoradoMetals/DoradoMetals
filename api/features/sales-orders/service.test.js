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
// sendEmail does, and this passes a recorder. Nothing is committed: every query
// runs in a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import withTransaction from "#shared/db/withTransaction.js";
import query from "#shared/db/query.js";
import * as service from "#features/sales-orders/service.js";
import * as salesOrderRepo from "#features/sales-orders/repo.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import { LOCKS, takeLocks } from "#shared/testing/locks.js";

let addressless;
let withAddress;
let supplier;

before(async () => {
  // Through the shared executor with no client, never pool.query: lint:db
  // enforces that everywhere, and it is the rule that makes the pinned pool
  // work at all - one place to intercept.
  const { rows } = await query(
    `SELECT id, order_number FROM exchange.sales_orders WHERE address_id IS NULL ORDER BY order_number LIMIT 1`
  );
  addressless = rows[0];
  assert.ok(
    addressless,
    "dev has no sales order without an address - the case production has is untested"
  );

  const withAddr = await query(
    `SELECT id, order_number FROM exchange.sales_orders WHERE address_id IS NOT NULL ORDER BY order_number LIMIT 1`
  );
  withAddress = withAddr.rows[0];
  assert.ok(withAddress, "dev has no sales order with an address");

  const refiners = await query(`SELECT id FROM exchange.suppliers LIMIT 1`);
  supplier = refiners.rows[0];
  assert.ok(supplier, "dev has no supplier to send an order to");
});

after(async () => {
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

const state = async (client, id) => {
  const { rows } = await query(
    `SELECT so.order_sent, so.supplier_id,
            (SELECT count(*)::int FROM exchange.shipments s
              WHERE s.sales_order_id = so.id AND s.type = 'Outbound') AS outbound
       FROM exchange.sales_orders so WHERE so.id = $1`,
    [id],
    client
  );
  return rows[0];
};

test("an order with no address is refused, and nothing is written", async () => {
  await withTransaction(async (client) => {
    await takeLocks(client, [LOCKS.ORDERS]);
    const before = await state(client, addressless.id);

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

    const after = await state(client, addressless.id);
    assert.deepEqual(
      after,
      before,
      "the refusal still attached a supplier, created a shipment or set order_sent"
    );

    throw new Error("rollback");
  }).catch((err) => {
    if (err.message !== "rollback") throw err;
  });
});

// THE ASSERTIONS ABOVE MUST BE ABLE TO SEE A WRITE. Comparing a row to itself
// passes whether or not the guard exists if the comparison is blind, so this
// performs the three writes the transaction would have performed and checks
// that `state` reports every one of them. It never goes near the email.
test("those three writes are visible to the assertion that says they did not happen", async () => {
  await withTransaction(async (client) => {
    await takeLocks(client, [LOCKS.ORDERS]);
    const before = await state(client, withAddress.id);

    await salesOrderRepo.attachSupplierToOrder(withAddress.id, supplier.id, client);
    await shipmentRepo.create(
      { sales_order_id: withAddress.id, type: "Outbound" },
      client
    );
    await salesOrderRepo.updateOrderSent(withAddress.id, client);

    const after = await state(client, withAddress.id);
    assert.notDeepEqual(after, before, "none of the three writes was observed at all");
    assert.equal(after.order_sent, true, "order_sent was not observed");
    assert.equal(after.supplier_id, supplier.id, "the supplier was not observed");
    assert.equal(
      after.outbound,
      before.outbound + 1,
      "the outbound shipment was not observed"
    );

    throw new Error("rollback");
  }).catch((err) => {
    if (err.message !== "rollback") throw err;
  });
});
