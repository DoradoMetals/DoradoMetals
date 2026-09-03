// What goes out when the app sends mail - each message (order confirmation, pricing notice, refiner's copy) must carry the right PDF attachment, built from the order.
// sendEmail takes an optional transport (like a repo call takes an executor) so this can record instead of send. Orders come from the repo, not a fixture, so the input stays the real wire shape. Read-only: nothing is sent or written.
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

// Records what it was asked to send; returns a result because nodemailer does, and undefined would hide a caller depending on it.
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

// Fails the way a real transport does on bad credentials, so a caller swallowing the failure would show up.
function failing() {
  return {
    sendMail: async () => {
      throw new Error("Invalid login: 535 Authentication failed");
    },
  };
}

// Returns the order AND its email address, guarded once here rather than at every call site - the composed user is optional, so an order without one TypeErrors at the send.
// Attachment.content is string | Buffer | Uint8Array (a text part is legal too), so this asserts which kind is expected rather than assuming.
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

  // `to` is a parameter, resolved and authorised by the controller from the stored order - it used to be read off the body, which made the endpoint an open relay.
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

// A send that fails must fail the caller - swallowing it would mean an order marked sent to a refiner who never received it.
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

// The PDF is built before the send - a document that cannot be built must stop the message rather than send one with nothing attached.
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
