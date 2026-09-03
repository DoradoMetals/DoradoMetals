// What goes out when the app sends mail - each message (order confirmation, pricing notice, refiner's copy) must carry the right PDF attachment, built from the order.
// sendEmail takes an optional transport (like a repo call takes an executor) so this can record instead of send. Orders come from the repo, not a fixture, so the input stays the real wire shape. Read-only: nothing is sent or written.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as emails from "#domain/media/emails/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as poRepo from "#domain/orders/read.service.ts";
import * as soRepo from "#domain/orders/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import type { RenderableOrder } from "#domain/media/pdfs/render/sections.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";
import { formatPurchaseOrderNumber, formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.ts";

// getAllPurchases/getAllSales declare Record<string, unknown>[] because read.service.ts discards the composed type at the boundary.
type MailOrder = RenderableOrder & {
  id: string;
  user?: { user_email?: string | null; user_name?: string | null } | null;
};
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];
type Message = Parameters<Transport["sendMail"]>[0];

let orders: MailOrder[];
let salesOrders: MailOrder[];
let spots: Spot[];

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  orders = (await poRepo.getAllPurchases()) as unknown as MailOrder[];
  salesOrders = (await soRepo.getAllSales()) as unknown as MailOrder[];
  // The composed shape (name/ask/bid) - the renderers read the schema's own spellings directly.
  spots = await spotsService.getSpotPrices();
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
    orders.find((o) => o.user?.user_email && (o.order_items?.length ?? 0) > 0) ?? orders[0];
  assert.ok(order, "dev has no purchase order to email");
  assert.ok(order.user?.user_email, `order ${order.id} has no email address to send to`);
  return { order, email: order.user.user_email };
};

test("the order confirmation goes to the customer with its packing list attached", async () => {
  const { order, email } = anOrderWithAUser();
  const t = recorder();

  // `to` is a parameter, resolved and authorised by the controller from the stored order - it used to be read off the body, which made the endpoint an open relay.
  await emails.sendCreatedEmail(
    { purchaseOrder: order, spotPrices: spots, packageDetails: { label: "Medium Box" } },
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
    `${formatPurchaseOrderNumber(order.number)}_packing_list.pdf`,
    "the attachment is named for a different order"
  );
  startsPdf(pdf.content, "the packing list attachment");
});

test("the pricing notice carries the invoice, named for the same order", async () => {
  const { order, email } = anOrderWithAUser();
  const t = recorder();

  await emails.sendPricedEmail(
    { order, order_spots: [], spot_prices: spots },
    email,
    t
  );

  const [msg] = t.sent;
  assert.equal(msg.to, email);
  assert.match(String(msg.subject), new RegExp(formatPurchaseOrderNumber(order.number)));
  assert.ok(msg.attachments, "the message carries no attachments at all");
  assert.equal(
    msg.attachments[0].filename,
    `${formatPurchaseOrderNumber(order.number)}_invoice.pdf`
  );
  startsPdf(msg.attachments[0].content, "the invoice attachment");
});

test("the refiner's copy goes to the address it was given, not the customer's", async () => {
  const order = salesOrders.find((o) => (o.order_items?.length ?? 0) > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders");
  const t = recorder();

  // The sales-order renderer declares a narrower input than the composed read (Record<string, unknown>) - asserted at the boundary, same as media/pdfs/service.ts.
  await emails.sendSalesOrderToSupplier(
    order as unknown as Parameters<typeof emails.sendSalesOrderToSupplier>[0],
    spots,
    "refiner@example.com",
    t
  );

  const [msg] = t.sent;
  assert.equal(msg.to, "refiner@example.com", "the refiner's copy went somewhere else");
  assert.notEqual(msg.to, order.user?.user_email);
  assert.match(String(msg.subject), new RegExp(formatSalesOrderNumber(order.number)));
  assert.ok(msg.attachments, "the message carries no attachments at all");
  assert.equal(
    msg.attachments[0].filename,
    `${formatSalesOrderNumber(order.number)}_invoice.pdf`
  );
});

// A send that fails must fail the caller - swallowing it would mean an order marked sent to a refiner who never received it.
test("a transport failure propagates rather than being swallowed", async () => {
  const { order, email } = anOrderWithAUser();

  await assert.rejects(
    () => emails.sendCreatedEmail(
      { purchaseOrder: order, spotPrices: spots, packageDetails: {} },
      email,
      failing()
    ),
    /Authentication failed/,
    "a failed send was reported as success"
  );
});

// The PDF is built before the send - a document that cannot be built must stop the message rather than send one with nothing attached.
test("nothing is sent when the document cannot be built", async () => {
  const t = recorder();

  await assert.rejects(
    () => emails.sendPricedEmail(
      { order: { number: 1, user: {} }, order_spots: [], spot_prices: spots },
      "x@y.z",
      t
    ),
    /invoice PDF generation failed/
  );
  assert.equal(t.sent.length, 0, "a message went out with no document");
});
