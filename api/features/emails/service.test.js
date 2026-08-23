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
import * as emails from "#features/emails/service.js";
import { closeBrowser } from "#features/pdf/render/browser.js";
import * as poRepo from "#features/purchase-orders/repo.js";
import * as soRepo from "#features/sales-orders/repo.js";
import * as spotsRepo from "#features/spots/repo.js";
import { toLegacy as spotsToLegacy } from "#features/spots/wire.js";
import { formatPurchaseOrderNumber, formatSalesOrderNumber } from "#shared/utils/formatOrderNumbers.js";

let orders;
let salesOrders;
let spots;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  orders = await poRepo.getAll();
  salesOrders = await soRepo.getAll();
  // Legacy-shaped on purpose. The PDF and email paths take spot prices from the
  // request body, and the frontend sends them in the shape /spots/spot_prices
  // returns today - type / ask_spot / bid_spot. The repo now returns the new
  // names, so this converts them the way the adapter does on the way out, which
  // is what production actually hands these functions.
  //
  // When SPOTS_WIRE flips and order spots move with it, this goes and
  // calculations.js reads the new names instead.
  spots = spotsToLegacy(await spotsRepo.getAll());
});

after(async () => {
  await closeBrowser();
  await pool.end();
});

// Records what it was asked to send. Returning a result matters: nodemailer
// does, and a test transport that returns undefined would hide a caller that
// depends on it.
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

// A transport that fails the way a real one does when the credentials are
// wrong, so a caller swallowing the failure would show up.
function failing() {
  return {
    sendMail: async () => {
      throw new Error("Invalid login: 535 Authentication failed");
    },
  };
}

const anOrderWithAUser = () =>
  orders.find((o) => o.user?.user_email && o.order_items?.length > 0) ?? orders[0];

test("the order confirmation goes to the customer with its packing list attached", async () => {
  const order = anOrderWithAUser();
  const t = recorder();

  await emails.sendCreatedEmail(
    { purchaseOrder: order, spotPrices: spots, packageDetails: { label: "Medium Box" } },
    t
  );

  assert.equal(t.sent.length, 1, "expected exactly one message");
  const [msg] = t.sent;
  assert.equal(msg.to, order.user.user_email, "sent to the wrong address");
  assert.match(msg.subject, /Order Has Been Placed/);
  assert.ok(msg.html?.length > 0, "no body");

  assert.equal(msg.attachments.length, 1);
  const [pdf] = msg.attachments;
  assert.equal(pdf.contentType, "application/pdf");
  assert.equal(
    pdf.filename,
    `${formatPurchaseOrderNumber(order.order_number)}_packing_list.pdf`,
    "the attachment is named for a different order"
  );
  assert.equal(
    Buffer.from(pdf.content.subarray(0, 5)).toString(), "%PDF-",
    "the attachment is not a PDF"
  );
});

test("the offer acceptance carries the invoice, named for the same order", async () => {
  const order = anOrderWithAUser();
  const t = recorder();

  await emails.sendAcceptedEmail(
    { order, order_spots: [], spot_prices: spots, email: order.user.user_email },
    t
  );

  const [msg] = t.sent;
  assert.equal(msg.to, order.user.user_email);
  assert.match(msg.subject, new RegExp(formatPurchaseOrderNumber(order.order_number)));
  assert.equal(
    msg.attachments[0].filename,
    `${formatPurchaseOrderNumber(order.order_number)}_invoice.pdf`
  );
  assert.equal(Buffer.from(msg.attachments[0].content.subarray(0, 5)).toString(), "%PDF-");
});

test("the refiner's copy goes to the address it was given, not the customer's", async () => {
  const order = salesOrders.find((o) => o.order_items?.length > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders");
  const t = recorder();

  await emails.sendSalesOrderToSupplier(order, spots, "refiner@example.com", t);

  const [msg] = t.sent;
  assert.equal(msg.to, "refiner@example.com", "the refiner's copy went somewhere else");
  assert.notEqual(msg.to, order.user?.user_email);
  assert.match(msg.subject, new RegExp(formatSalesOrderNumber(order.order_number)));
  assert.equal(
    msg.attachments[0].filename,
    `${formatSalesOrderNumber(order.order_number)}_invoice.pdf`
  );
});

// A send that fails must fail the caller. Swallowing it would mean an order
// marked as sent to a refiner who never received it.
test("a transport failure propagates rather than being swallowed", async () => {
  const order = anOrderWithAUser();

  await assert.rejects(
    () => emails.sendCreatedEmail(
      { purchaseOrder: order, spotPrices: spots, packageDetails: {} },
      failing()
    ),
    /Authentication failed/,
    "a failed send was reported as success"
  );
});

// The PDF is built before the send, so a document that cannot be built must
// stop the message rather than send one with nothing attached.
test("nothing is sent when the document cannot be built", async () => {
  const t = recorder();

  await assert.rejects(
    () => emails.sendAcceptedEmail(
      { order: { order_number: 1, user: {} }, order_spots: [], spot_prices: spots, email: "x@y.z" },
      t
    ),
    /invoice PDF generation failed/
  );
  assert.equal(t.sent.length, 0, "a message went out with no document");
});
