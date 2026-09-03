// What actually goes out when the app sends mail.
//
// 119 lines with no test, sending the two messages a customer receives - the
// order confirmation with its packing list, the offer acceptance with its
// invoice - and the one a refiner receives. Every one carries a PDF built from
// the order, so a wrong attachment is a customer receiving somebody's document
// or none at all.
//
// It had no test because there was no seam: sendEmail built its transport at
// module load from the environment, and calling it sent real mail. It now takes
// an optional transport, the way a repo call takes an executor, and these pass
// one that records the message instead of sending it.
//
// The orders come from the repo rather than a fixture, for the same reason as
// the PDF tests: the input is the wire shape, and a literal would drift from it
// silently.
//
// Read-only. Nothing is sent and nothing is written.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as emails from "#domain/media/emails/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import { formatPurchaseOrderNumber, formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.ts";
import type { OrderView } from "@dorado/contracts";

type Message = Parameters<Transport["sendMail"]>[0];

// EVERY SENDER TAKES THE DOCUMENT'S INPUTS NOW (D214 item 12), resolved from
// the order's id by domain/media/pdfs/order-inputs.ts - the composed order the
// senders used to take is gone, and so is the `Record<string, unknown>` its
// service boundary handed over.
let orders: OrderView[];
let salesOrders: OrderView[];

const viewsOf = async (direction: "purchase" | "sale") => {
  const out: OrderView[] = [];
  for (const row of await orderRead.list({ direction })) {
    const view = await orderRead.view(row.id);
    if (view) out.push(view);
  }
  return out;
};

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  orders = await viewsOf("purchase");
  salesOrders = await viewsOf("sale");
});

after(async () => {
  await closeBrowser();
  await pool.end();
});

// Records what it was asked to send. Returning a result matters: nodemailer
// does, and a test transport that returns undefined would hide a caller that
// depends on it.
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

// A transport that fails the way a real one does when the credentials are
// wrong, so a caller swallowing the failure would show up.
function failing() {
  return {
    sendMail: async () => {
      throw new Error("Invalid login: 535 Authentication failed");
    },
  };
}

// Returns the order AND the address it is emailed to, guarded once here rather
// than reached for through two optional levels at every call site. The composed
// `user` is optional, so an order without one TypeError'd at the send.
// The attachment body as a PDF check. `Attachment.content` is
// `string | Buffer | Uint8Array` because a text part is legal there too, so the
// PDF assertions say which they expect rather than assuming.
const startsPdf = (content: string | Buffer | Uint8Array, what: string) => {
  assert.ok(typeof content !== "string", `${what} arrived as text, not bytes`);
  assert.equal(Buffer.from(content.subarray(0, 5)).toString(), "%PDF-", `${what} is not a PDF`);
};

const anOrderWithAUser = () => {
  const order =
    orders.find((o) => o.user?.email && o.items.length > 0) ?? orders[0];
  assert.ok(order, "dev has no purchase order to email");
  assert.ok(order.user?.email, `order ${order.order.id} has no email address to send to`);
  return { order, email: order.user!.email };
};

test("the order confirmation goes to the customer with its packing list attached", async () => {
  const { order, email } = anOrderWithAUser();
  const t = recorder();

  // `to` is a parameter now, resolved and authorised by the controller from the
  // stored order. It used to be read off purchaseOrder.user.user_email, which
  // made the endpoint an open relay - the body chose the recipient. Passing the
  // same address here keeps this test asserting exactly what it did before.
  await emails.sendCreatedEmail(
    await inputs.packingListInputs(order.order.id),
    email,
    t
  );

  assert.equal(t.sent.length, 1, "expected exactly one message");
  const [msg] = t.sent;
  assert.equal(msg.to, email, "sent to the wrong address");
  assert.match(String(msg.subject), /Order Has Been Placed/);
  assert.ok((msg.html?.length ?? 0) > 0, "no body");

  assert.ok(msg.attachments, "the message carries no attachments at all");
  assert.equal(msg.attachments.length, 1);
  const [pdf] = msg.attachments;
  assert.equal(pdf.contentType, "application/pdf");
  assert.equal(
    pdf.filename,
    `${formatPurchaseOrderNumber(order.order.number)}_packing_list.pdf`,
    "the attachment is named for a different order"
  );
  startsPdf(pdf.content, "the packing list attachment");
});

test("the pricing notice carries the invoice, named for the same order", async () => {
  const { order, email } = anOrderWithAUser();
  const t = recorder();

  await emails.sendPricedEmail(await inputs.invoiceInputs(order.order.id), email, t);

  const [msg] = t.sent;
  assert.equal(msg.to, email);
  assert.match(String(msg.subject), new RegExp(formatPurchaseOrderNumber(order.order.number)));
  assert.ok(msg.attachments, "the message carries no attachments at all");
  assert.equal(
    msg.attachments[0].filename,
    `${formatPurchaseOrderNumber(order.order.number)}_invoice.pdf`
  );
  startsPdf(msg.attachments[0].content, "the invoice attachment");
});

test("the refiner's copy goes to the address it was given, not the customer's", async () => {
  const order = salesOrders.find((o) => o.items.length > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders");
  const t = recorder();

  await emails.sendSalesOrderToSupplier(
    await inputs.salesOrderInvoiceInputs(order.order.id),
    "refiner@example.com",
    t
  );

  const [msg] = t.sent;
  assert.equal(msg.to, "refiner@example.com", "the refiner's copy went somewhere else");
  assert.notEqual(msg.to, order.user?.email);
  assert.match(String(msg.subject), new RegExp(formatSalesOrderNumber(order.order.number)));
  assert.ok(msg.attachments, "the message carries no attachments at all");
  assert.equal(
    msg.attachments[0].filename,
    `${formatSalesOrderNumber(order.order.number)}_invoice.pdf`
  );
});

// A send that fails must fail the caller. Swallowing it would mean an order
// marked as sent to a refiner who never received it.
test("a transport failure propagates rather than being swallowed", async () => {
  const { order, email } = anOrderWithAUser();

  await assert.rejects(
    async () => emails.sendCreatedEmail(
      await inputs.packingListInputs(order.order.id),
      email,
      failing()
    ),
    /Authentication failed/,
    "a failed send was reported as success"
  );
});

// The PDF is built before the send, so a document that cannot be built must
// stop the message rather than send one with nothing attached.
// The PDF is built before the send, so a document that cannot be built must
// stop the message rather than send one with nothing attached. An order view
// with a line whose metal has no quote is exactly that: pricing throws.
test("nothing is sent when the document cannot be built", async () => {
  const t = recorder();
  const { order, email } = anOrderWithAUser();
  const built = await inputs.invoiceInputs(order.order.id);

  await assert.rejects(
    () => emails.sendPricedEmail({ ...built, bids: new Map() }, email, t),
    /invoice PDF generation failed/
  );
  assert.equal(t.sent.length, 0, "a message went out with no document");
});
