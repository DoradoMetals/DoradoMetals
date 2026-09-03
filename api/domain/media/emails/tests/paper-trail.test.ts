// The paper trail: every send becomes a row (both outcomes), and the document it carried is a row the record points at.
// Runs the REAL senders with only the transport replaced; writes join this file's transaction via the executor seam and roll back - without one, a test-run send writes nothing (the isTestRun guard, pinned here).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as emails from "#domain/media/emails/service.ts";
import { recordEmail } from "#domain/media/emails/record.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inRollback } from "#shared/testing/rollback.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import type { OrderView } from "@dorado/contracts";

let client: PoolClient;
type Message = Parameters<Transport["sendMail"]>[0];

// EVERY SENDER TAKES THE DOCUMENT'S INPUTS (D214 item 12), resolved from the
// order's id - the composed order they used to take is gone.
let orders: OrderView[];

// SESSION-scoped LOCKS.ORDERS, held for the whole file (lane 3, the runner
// conversion): `orders` is captured here, before any per-test transaction
// exists, and domain/orders/tests/edit-line.test.ts writes real,
// autocommitting rows to orders.orders under the SAME lock - see
// domain/media/pdfs/tests/documents-agree.test.ts's own comment for the full
// mechanism.
beforeAll(async () => {
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
  orders = [];
  for (const row of await orderRead.list({ direction: "purchase" })) {
    const view = await orderRead.view(row.id);
    if (view) orders.push(view);
  }
  assert.ok(orders.length > 0, "dev has no purchase orders to render");
});

afterAll(async () => {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  client.release();
  await closeBrowser();
  await pool.end();
});

// Satisfies the transport rather than restating its shape.
const recorder = (): Transport & { sent: Message[] } => {
  const sent: Message[] = [];
  return {
    sent,
    sendMail: async (msg: Message) => {
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

// Returns the order AND its email address, so callers get a string rather than reaching through two optional levels each time.
const anOrderWithAUser = () => {
  const order =
    orders.find((o) => o.user?.email && o.items.length > 0) ?? orders[0];
  assert.ok(order, "dev has no purchase order to email");
  assert.ok(order.user?.email, `order ${order.order.id} has no email address to send to`);
  return { order, email: order.user!.email, user: order.user! };
};

test("a successful send leaves a sent row pointing at its stored document", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email, user } = anOrderWithAUser();
    await emails.sendCreatedEmail(
      await inputs.packingListInputs(order.order.id, c),
      email,
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
    assert.equal(r.to_address, email);
    assert.equal(r.provider_message_id, "<recorded@test>");
    assert.ok(r.pdf_id, "the send does not point at its document");
    assert.equal(r.pdf_kind, "packing_list");
    assert.ok(Number(r.size_bytes) > 0, "the document row has no size");
    assert.match(r.checksum, /^[0-9a-f]{64}$/, "no sha256 on the document");
  });
});

test("a failed send throws and records no row", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email, user } = anOrderWithAUser();
    await assert.rejects(
      async () =>
        emails.sendCreatedEmail(
          await inputs.packingListInputs(order.order.id, c),
          email,
          failing(),
          c
        ),
      /535 Authentication failed/
    );

    const { rows } = await c.query(
      `SELECT status, error FROM media.emails WHERE kind = 'purchase_order_created'`
    );
    assert.equal(rows.length, 0, "a failed send should not leave a row");
  });
});

// An order with no orders.orders row still gets its record - the refused link is dropped, not the row.
test("a record for an order the new schema does not know keeps everything but the link", async () => {
  await inRollback(async (c: PoolClient) => {
    await recordEmail(
      {
        kind: "sales_order_to_supplier",
        to: "refiner@example.test",
        subject: "paper-trail probe",
        order_id: randomUUID(),
      },
      { status: "sent" },
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

// The guard the whole file leans on: no executor in a test run means no rows, ever - the alternative is a leak into dev on every suite run.
test("without a transaction, a test-run send records nothing", async () => {
  const { order, email, user } = anOrderWithAUser();
  await emails.sendCreatedEmail(
    await inputs.packingListInputs(order.order.id),
    email,
    recorder()
    // no executor, deliberately
  );
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM media.emails WHERE kind = 'purchase_order_created'`
  );
  assert.equal(rows[0].n, 0, "an executor-less test send committed a real row - the guard rotted");
});

// The verification mail was the one send with no row: better-auth's callback (features/auth/client.ts) now goes through sendAuthVerificationEmail, so both outcomes are rows like every other sender's.
test("a verification mail leaves an auth_verification row with its user", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email, user } = anOrderWithAUser();
    const t = recorder();
    await emails.sendAuthVerificationEmail(
      {
        user: { id: user.id, email: email, name: user.name },
        url: "https://example.test/verify-email?token=t",
        isSignUp: true,
      },
      t,
      c
    );

    assert.equal(t.sent.length, 1, "nothing left the recorder");
    assert.equal(t.sent[0].subject, "Welcome to Dorado Metals Exchange");

    // Scoped to this send's address, not table-wide - dev holds other real committed auth_verification rows, which a table-wide count would double-count.
    const { rows } = await c.query(
      `SELECT status, to_address, user_id, order_id, pdf_id, provider_message_id
         FROM media.emails WHERE kind = 'auth_verification' AND to_address = $1`,
      [email]
    );
    assert.equal(rows.length, 1, "one send, one row");
    assert.equal(rows[0].status, "sent");
    assert.equal(rows[0].to_address, email);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].order_id, null, "a verification mail has no order");
    assert.equal(rows[0].pdf_id, null, "and no document");
    assert.equal(rows[0].provider_message_id, "<recorded@test>");
  });
});

test("a failed verification mail throws and reaches better-auth unchanged", async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      () =>
        emails.sendAuthVerificationEmail(
          {
            user: { id: null, email: "new-signup@example.test", name: "New Signup" },
            url: "https://example.test/verify-email?token=t",
          },
          failing(),
          c
        ),
      /535 Authentication failed/
    );

    // Scoped by address, same reason as above: the table holds other real committed verification rows.
    const { rows } = await c.query(
      `SELECT status, error, user_id FROM media.emails
        WHERE kind = 'auth_verification' AND to_address = 'new-signup@example.test'`
    );
    assert.equal(rows.length, 0, "a failed send should not leave a row");
  });
});
