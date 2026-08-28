// The paper trail: every send becomes a row, both outcomes, and the document
// it carried is a row the record points at.
//
// Runs the REAL senders - real order data, real PDF render - with only the
// transport replaced, exactly like service.test.js beside it. The trail's
// writes join this file's transaction through the executor seam and roll
// back; without an executor a test run writes nothing at all (the isTestRun
// guard in record.ts / store.ts, pinned here so it cannot rot).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as emails from "#features/media/emails/service.ts";
import { recordEmail } from "#features/media/emails/record.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as poRepo from "#features/purchase-orders/repo.js";
import { toLegacy as spotsToLegacy } from "#features/spots/legacy-shape.ts";
import * as spotsService from "#features/spots/service.ts";

let client;
let orders;
let spots;

before(async () => {
  client = await pool.connect();
  orders = await poRepo.getAll();
  spots = spotsToLegacy(await spotsService.getSpotPrices());
  assert.ok(orders.length > 0, "dev has no purchase orders to render");
});

after(async () => {
  client.release();
  await closeBrowser();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const recorder = () => {
  const sent = [];
  return {
    sent,
    sendMail: async (msg) => {
      sent.push(msg);
      return { messageId: "<recorded@test>" };
    },
  };
};

const failing = () => ({
  sendMail: async () => {
    throw new Error("Invalid login: 535 Authentication failed");
  },
});

const anOrderWithAUser = () =>
  orders.find((o) => o.user?.user_email && o.order_items?.length > 0) ?? orders[0];

test("a successful send leaves a sent row pointing at its stored document", async () => {
  await inRollback(async (c) => {
    const order = anOrderWithAUser();
    await emails.sendCreatedEmail(
      { purchaseOrder: order, spotPrices: spots, packageDetails: { label: "Medium Box" } },
      order.user.user_email,
      recorder(),
      c
    );

    const { rows } = await c.query(
      `SELECT e.status, e.to_address, e.provider_message_id, e.order_id, e.pdf_id,
              p.kind AS pdf_kind, p.checksum, p.size_bytes
         FROM media.emails e
         LEFT JOIN media.pdfs p ON p.id = e.pdf_id
        WHERE e.kind = 'purchase_order_created'`
    );
    assert.equal(rows.length, 1, "one send, one row");
    const r = rows[0];
    assert.equal(r.status, "sent");
    assert.equal(r.to_address, order.user.user_email);
    assert.equal(r.provider_message_id, "<recorded@test>");
    assert.ok(r.pdf_id, "the send does not point at its document");
    assert.equal(r.pdf_kind, "packing_list");
    assert.ok(Number(r.size_bytes) > 0, "the document row has no size");
    assert.match(r.checksum, /^[0-9a-f]{64}$/, "no sha256 on the document");
  });
});

test("a failed send is a row too, carrying the error, and the throw continues", async () => {
  await inRollback(async (c) => {
    const order = anOrderWithAUser();
    await assert.rejects(
      () =>
        emails.sendCreatedEmail(
          { purchaseOrder: order, spotPrices: spots, packageDetails: { label: "Medium Box" } },
          order.user.user_email,
          failing(),
          c
        ),
      /535 Authentication failed/
    );

    const { rows } = await c.query(
      `SELECT status, error FROM media.emails WHERE kind = 'purchase_order_created'`
    );
    assert.equal(rows.length, 1, "the failure was not recorded");
    assert.equal(rows[0].status, "failed");
    assert.match(rows[0].error, /535/, "the record lost the reason");
  });
});

// An order that predates dual has no orders.orders row; the record survives
// the refused link rather than vanishing over it.
test("a record for an order the new schema does not know keeps everything but the link", async () => {
  await inRollback(async (c) => {
    await recordEmail(
      {
        kind: "sales_order_to_supplier",
        status: "sent",
        to: "refiner@example.test",
        subject: "paper-trail probe",
        order_id: randomUUID(),
      },
      c
    );
    const { rows } = await c.query(
      `SELECT order_id, to_address FROM media.emails WHERE subject = 'paper-trail probe'`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].order_id, null, "the bogus link should have been dropped, not the row");
    assert.equal(rows[0].to_address, "refiner@example.test");
  });
});

// The guard the whole file leans on: no executor in a test run means NO rows,
// anywhere, ever - the alternative is a leak into dev on every suite run.
test("without a transaction, a test-run send records nothing", async () => {
  const order = anOrderWithAUser();
  const probe = `no-exec-${randomUUID().slice(0, 8)}`;
  await emails.sendCreatedEmail(
    { purchaseOrder: { ...order, order_number: order.order_number }, spotPrices: spots, packageDetails: { label: probe } },
    order.user.user_email,
    recorder()
    // no executor, deliberately
  );
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM media.emails WHERE kind = 'purchase_order_created'`
  );
  assert.equal(rows[0].n, 0, "an executor-less test send committed a real row - the guard rotted");
});
