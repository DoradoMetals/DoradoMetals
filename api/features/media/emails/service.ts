import { requiredEnv } from "#shared/env/required.ts";
import * as pdfService from "#features/media/pdfs/service.ts";
import type { PackingListInput, InvoiceInput } from "#features/media/pdfs/service.ts";
import type { Transport } from "#providers/emails/nodemailer.ts";

import {
  renderPurchaseOrderPlacedEmail,
  renderOrderPricedEmail,
  renderSalesOrderToSupplierEmail,
  renderAccountCreatedEmail,
  renderVerifyEmail,
} from "#features/media/emails/utils/renderEmail.ts";
import type { SalesOrderForRender, SupplierSpot } from "#features/media/emails/utils/renderEmail.ts";

import { sendEmail } from "#providers/emails/nodemailer.ts";
import * as purchaseOrderReads from "#features/orders/read.service.ts";
// The LIVE spot feed - the same read the pricing paths use (spots.spots,
// converted names). The exchange.metals read died with the dual layer (D212).
import * as spotsFeed from "#features/spots/service.ts";
import * as packages from "#features/shipping/packages/repo.ts";
import * as shipmentOrderRead from "#features/shipping/shipments/order-read.ts";
import { recordEmail, messageIdOf } from "#features/media/emails/record.ts";
import { persistPdf } from "#features/media/pdfs/store.ts";
import type { PoolClient } from "pg";
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from "#shared/utils/formatOrderNumbers.ts";

// `transport` is a separate parameter, not a field on the input object: the
// controller passes req.body as the input, so a field would be reachable from
// the request. In production nothing passes one and the shared transport is
// used. See utils/sendEmail.ts.
//
// payoutDetails used to be passed on to generatePackingList, which does not
// accept it - the packing list reads the fee off purchaseOrder.payout.cost. It
// is still accepted here because the frontend sends it, and dropping a field
// from a request body is a wire change.
// `to` IS A PARAMETER, NOT A FIELD OF THE BODY.
//
// This sent to `purchaseOrder.user.user_email`, an address out of req.body,
// behind requireUser. Any signed-in account could send mail FROM the business's
// own domain TO any address it named, subject "Your Order Has Been Placed!",
// with a PDF attachment it also supplied - an open relay and a ready-made
// phishing template, at the cost of the sending domain's reputation.
//
// The recipient is now resolved and authorised by the controller, from the
// stored order, and handed in. Same seam as `transport`: a separate parameter
// rather than a field on the input object, because the input object IS req.body
// and anything read off it can be chosen by the caller.
//
// The input is PackingListInput because that is exactly what it forwards to
// generatePackingList - named rather than restated, so a field added there
// cannot quietly stop being accepted here.
//
// `user_name` comes off RenderableOrder.user, which is
// `Record<string, unknown>`: the order's user is joined in and its shape is not
// pinned by a contract. Coerced at the boundary rather than asserted, because
// an object where a name is expected would render "[object Object]" into a
// customer's greeting.
// D91: THE CONFIRMATION EMAIL IS THE SERVER'S TO SEND, keyed by order id.
//
// It was sent BY THE BROWSER until wave 3 - an await in the create mutation's
// onSuccess, POSTing the whole composed order plus the spot feed, the package
// and the payout method to /emails/purchase_order_created, wrapped in a
// try/catch that only console.error'd. Three things were wrong with that and
// each is a standing ruling:
//
//   RULING 10, ids in and data out. The content of a customer's confirmation
//   - every figure on the attached packing list - came from data the CLIENT
//   supplied. This renders from the server's own read of the order that was
//   just committed.
//   RELIABILITY. Close the tab, lose the network, get a 500: no email, no
//   record, no retry, nobody told. Same shape as D49.
//   THE SLOTS IT READ ARE GONE. purchaseOrder.shipment.package and
//   purchaseOrder.payout.method were members of the composed wire, so it
//   broke with this wave regardless.
//
// AFTER THE COMMIT, NEVER INSIDE IT. An email cannot be rolled back, which is
// the rule shared/db/transaction-side-effects.test.js fails the build over;
// createPurchaseOrder calls this once withTransaction has returned.
//
// IT DOES NOT THROW. The order exists and is paid for by the time this runs -
// failing the response over an email would be a worse outcome than a missing
// one, and the send is not silent either way: recordEmail writes a
// media.emails row with status 'failed' and the error, which is the paper
// trail the browser version never had.
//
// `transport` and `executor` are the usual test seams.
export async function sendOrderPlacedConfirmation(
  order_id: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  try {
    const purchaseOrder = (await purchaseOrderReads.findPurchaseById(order_id, executor)) as
      | (Record<string, any> & { user?: { user_email?: string | null } | null })
      | null;
    if (!purchaseOrder) return;

    const to = purchaseOrder.user?.user_email;
    if (typeof to !== "string" || to.length === 0) return;

    // THE PACKING LIST'S INPUTS, RESOLVED SERVER-SIDE. The live feed comes
    // from the spot read the pricing paths use; the package is the one the
    // parcel was actually booked with - shipping.shipments names it by id and
    // shipping.packages holds its label and dimensions, which is where the
    // browser's `packageOptions.find(...)` guess was always trying to land.
    const spotPrices = await spotsFeed.getSpotPrices(executor);
    const [shipment] = await shipmentOrderRead.getForOrder(order_id, executor);
    const pkg = shipment?.package_id
      ? await packages.getOne(shipment.package_id, executor)
      : undefined;
    const packageDetails = pkg
      ? {
          label: pkg.label,
          dimensions: {
            length: Number(pkg.length),
            width: Number(pkg.width),
            height: Number(pkg.height),
          },
        }
      : undefined;

    await sendCreatedEmail(
      { purchaseOrder, spotPrices, packageDetails } as PackingListInput,
      to,
      transport,
      executor
    );
  } catch (err) {
    // sendCreatedEmail has already recorded a failed send if it got that far.
    // Anything else here - a read that failed, a package that would not
    // resolve - is logged and dropped, because the order is placed either way.
    console.error(`confirmation email for order ${order_id} was not sent:`, err);
  }
}

export async function sendCreatedEmail(
  { purchaseOrder, spotPrices, packageDetails }: PackingListInput,
  to: string,
  transport?: Transport,
  // The paper-trail writes join a test's transaction through this; production
  // callers omit it and the records go to the pool, after the send.
  executor?: PoolClient
): Promise<void> {
  const pdfBuffer = await pdfService.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
  });

  // The order being placed IS the status event: the document persists here,
  // once, and the record of the send points at it. Neither may break the
  // send - both helpers swallow their own failures by design.
  const orderId = typeof purchaseOrder.id === "string" ? purchaseOrder.id : null;
  const pdfId = await persistPdf({ kind: "packing_list", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = "Your Order Has Been Placed!";
  const record = {
    kind: "purchase_order_created" as const,
    to, subject, order_id: orderId, pdf_id: pdfId,
    user_id: typeof purchaseOrder.user?.user_id === "string" ? purchaseOrder.user.user_id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderPurchaseOrderPlacedEmail({
        firstName: String(purchaseOrder.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/account?tab=sold`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            purchaseOrder.number
          )}_packing_list.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail({ ...record, status: "failed", error: err instanceof Error ? err.message : String(err) }, executor);
    throw err;
  }
  await recordEmail({ ...record, status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// Same change, and this one was more direct: `email` came off the body and went
// straight into `to:`.
// THE FIELD NAMES DIFFER FROM InvoiceInput'S ON PURPOSE. This takes `order`,
// `order_spots` and `spot_prices` - snake_case, because that is what the
// controller destructures out of req.body - and maps them onto the pdf
// service's purchaseOrder / orderSpots / spotPrices below. Renaming either side
// would be a wire change.
export async function sendPricedEmail(
  {
    order,
    order_spots,
    spot_prices,
  }: {
    order: InvoiceInput["purchaseOrder"];
    order_spots?: InvoiceInput["orderSpots"];
    spot_prices?: InvoiceInput["spotPrices"];
  },
  to: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateInvoice({
      purchaseOrder: order,
      orderSpots: order_spots,
      spotPrices: spot_prices,
    });
  } catch (err) {
    // `err` is unknown in a strict file, and rethrowing a non-Error unchanged is
    // better than crashing while trying to annotate it.
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const orderId = typeof order.id === "string" ? order.id : null;
  const pdfId = await persistPdf({ kind: "invoice", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = `Your Order Has Been Priced - Order ${formatPurchaseOrderNumber(order.number)}`;
  const record = {
    kind: "purchase_order_priced" as const,
    to, subject, order_id: orderId, pdf_id: pdfId,
    user_id: typeof order.user?.user_id === "string" ? order.user.user_id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to,
      subject,
      html: renderOrderPricedEmail({
        firstName: String(order.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
      }),
      attachments: [
        {
          filename: `${formatPurchaseOrderNumber(
            order.number
          )}_invoice.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail({ ...record, status: "failed", error: err instanceof Error ? err.message : String(err) }, executor);
    throw err;
  }
  await recordEmail({ ...record, status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// `order` IS NEARLY THE CONTRACT, AND THE GAP IS THE TIMESTAMPS.
//
// This said the wire contract type, with a comment calling it "the stronger true
// statement" about the object. It was not true. The caller is
// sales-orders/service.ts, which passes what getById returned - a database row,
// where pg has already parsed created_at and updated_at into Date objects,
// while the contract describes the wire and says string. Converting the caller
// to TypeScript is what surfaced it; the JavaScript version could pass anything.
//
// Checked before widening rather than after, because a type that contradicts
// working code is usually the type. features/pdf/render/sections.ts already
// declares `created_at?: string | number | Date | null` and calls `new Date(...)`
// on it, so both renderers have always handled a Date. Nothing at runtime
// changes; SalesOrderForRender just says what is actually passed.
//
// The rest of the old comment still holds: generateSalesOrderInvoice takes
// RenderableOrder, which is deliberately loose - what a template needs, not
// what a sales order is - and one object is handed to both consumers.

export async function sendSalesOrderToSupplier(
  order: SalesOrderForRender,
  spots: SupplierSpot[],
  email: string,
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await pdfService.generateSalesOrderInvoice({
      salesOrder: order,
      spots,
    });
  } catch (err) {
    // `err` is unknown in a strict file, and rethrowing a non-Error unchanged is
    // better than crashing while trying to annotate it.
    if (err instanceof Error) {
      err.message = `[EmailService] invoice PDF generation failed: ${err.message}`;
    }
    throw err;
  }

  const orderId = typeof order.id === "string" ? order.id : null;
  const pdfId = await persistPdf({ kind: "sales_order_invoice", order_id: orderId, bytes: pdfBuffer }, executor);

  const subject = `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(order.number)}`;
  const record = {
    kind: "sales_order_to_supplier" as const,
    to: email, subject, order_id: orderId, pdf_id: pdfId,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      // `email` here is not from a request body - sendSalesOrderToSupplier is not
      // a route. It is called with the refiner's address the order was placed
      // against, and it already took it as an explicit parameter.
      to: email,
      subject,
      html: renderSalesOrderToSupplierEmail({
        firstName: String(order.user?.user_name ?? ""),
        url: `${requiredEnv("FRONTEND_URL")}/orders`,
        order,
        spots,
      }),
      attachments: [
        {
          filename: `${formatSalesOrderNumber(order.number)}_invoice.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }, transport);
  } catch (err) {
    await recordEmail({ ...record, status: "failed", error: err instanceof Error ? err.message : String(err) }, executor);
    throw err;
  }
  await recordEmail({ ...record, status: "sent", provider_message_id: messageIdOf(result) }, executor);
}

// THE VERIFICATION MAIL, RECORDED (D78's open question, answered "yes, there
// is a seam"). better-auth does not send this mail - it calls
// emailVerification.sendVerificationEmail in features/auth/client.ts, a
// callback THIS codebase wrote, which was already rendering our template and
// calling our sendEmail. That callback now calls this sender, so the send
// leaves a media.emails row like every other - both outcomes, the failure
// with its error text and the throw continuing to better-auth unchanged.
//
// No order and no PDF: order_id and pdf_id stay null, which media.emails
// allows. `user.id` is real - better-auth commits the user through its own
// pool before it asks for the mail - and recordEmail swallows a refused FK
// to stderr rather than breaking the send either way.
//
// (transport, executor) is the same seam pair as every sender above: the
// paper-trail tests pass a recorder and their pinned transaction; production
// passes neither and better-auth's callback stays one line.
export async function sendAuthVerificationEmail(
  {
    user,
    url,
    isSignUp = false,
  }: {
    user: { id?: string | null; email: string; name?: string | null };
    url: string;
    isSignUp?: boolean;
  },
  transport?: Transport,
  executor?: PoolClient
): Promise<void> {
  // The subject and template split is verbatim from the callback this
  // replaces: a sign-up gets the welcome mail, everything else the plain
  // verify mail. Same words, same templates - only the record is new.
  const subject = isSignUp
    ? "Welcome to Dorado Metals Exchange"
    : "Verify Your Email Address";

  const record = {
    kind: "auth_verification" as const,
    to: user.email,
    subject,
    user_id: typeof user.id === "string" ? user.id : null,
  };
  let result: unknown;
  try {
    result = await sendEmail({
      to: user.email,
      subject,
      text: `Click the link to verify your email: ${url}`,
      html: isSignUp
        ? renderAccountCreatedEmail({ firstName: String(user.name ?? ""), url })
        : renderVerifyEmail({ firstName: String(user.name ?? ""), url }),
    }, transport);
  } catch (err) {
    await recordEmail({ ...record, status: "failed", error: err instanceof Error ? err.message : String(err) }, executor);
    throw err;
  }
  await recordEmail({ ...record, status: "sent", provider_message_id: messageIdOf(result) }, executor);
}
