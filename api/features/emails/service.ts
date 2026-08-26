import * as pdfService from "#features/pdf/service.ts";
import type { PackingListInput, InvoiceInput } from "#features/pdf/service.ts";
import type { Transport } from "#features/emails/utils/sendEmail.ts";
import type { SpotPriceWire, SalesOrderWire } from "@dorado/contracts";

import {
  renderPurchaseOrderPlacedEmail,
  renderOfferAcceptedEmail,
  renderSalesOrderToSupplierEmail,
} from "#features/emails/utils/renderEmail.ts";
import type { SalesOrderForRender } from "#features/emails/utils/renderEmail.ts";

import { sendEmail } from "#features/emails/utils/sendEmail.ts";
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
export async function sendCreatedEmail(
  { purchaseOrder, spotPrices, packageDetails }: PackingListInput,
  to: string,
  transport?: Transport
): Promise<void> {
  const pdfBuffer = await pdfService.generatePackingList({
    purchaseOrder,
    spotPrices,
    packageDetails,
  });

  await sendEmail({
    to,
    subject: "Your Order Has Been Placed!",
    html: renderPurchaseOrderPlacedEmail({
      firstName: String(purchaseOrder.user?.user_name ?? ""),
      url: `${process.env.FRONTEND_URL}/account?tab=sold`,
    }),
    attachments: [
      {
        filename: `${formatPurchaseOrderNumber(
          purchaseOrder.order_number
        )}_packing_list.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}

// Same change, and this one was more direct: `email` came off the body and went
// straight into `to:`.
// THE FIELD NAMES DIFFER FROM InvoiceInput'S ON PURPOSE. This takes `order`,
// `order_spots` and `spot_prices` - snake_case, because that is what the
// controller destructures out of req.body - and maps them onto the pdf
// service's purchaseOrder / orderSpots / spotPrices below. Renaming either side
// would be a wire change.
export async function sendAcceptedEmail(
  {
    order,
    order_spots,
    spot_prices,
  }: {
    order: InvoiceInput["purchaseOrder"];
    order_spots?: SpotPriceWire[];
    spot_prices?: SpotPriceWire[];
  },
  to: string,
  transport?: Transport
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

  await sendEmail({
    to,
    subject: `Offer Accepted - Order ${formatPurchaseOrderNumber(
      order.order_number
    )}`,
    html: renderOfferAcceptedEmail({
      firstName: String(order.user?.user_name ?? ""),
      url: `${process.env.FRONTEND_URL}/orders`,
    }),
    attachments: [
      {
        filename: `${formatPurchaseOrderNumber(
          order.order_number
        )}_invoice.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}

// `order` IS NEARLY THE CONTRACT, AND THE GAP IS THE TIMESTAMPS.
//
// This said SalesOrderWire, with a comment calling it "the stronger true
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
  spots: SpotPriceWire[],
  email: string,
  transport?: Transport
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

  await sendEmail({
    // `email` here is not from a request body - sendSalesOrderToSupplier is not
    // a route. It is called with the refiner's address the order was placed
    // against, and it already took it as an explicit parameter.
    to: email,
    subject: `Dorado Metals Exchange - New Order ${formatSalesOrderNumber(
      order.order_number
    )}`,
    html: renderSalesOrderToSupplierEmail({
      firstName: String(order.user?.user_name ?? ""),
      url: `${process.env.FRONTEND_URL}/orders`,
      order,
      spots,
    }),
    attachments: [
      {
        filename: `${formatSalesOrderNumber(order.order_number)}_invoice.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  }, transport);
}
