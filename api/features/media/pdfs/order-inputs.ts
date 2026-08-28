// EVERY DOCUMENT'S INPUTS, LOADED BY ORDER ID (ruling 10, wave 3).
//
// "The frontend sends IDs - plus genuine user input - and gets data back."
// The four PDF routes were the last standing violation named in ruling 10:
// each POSTed the WHOLE composed order, plus the live spot feed, plus the
// package and the payout method, as its render body. So a customer's invoice
// was rendered from numbers the customer's browser supplied - and the wire
// slim removed the composed order those bodies were built from, which made
// fixing it the critical path rather than a tidy-up.
//
// The body is `{ order_id }` now and this is what fills the gap: one place
// that resolves an order's render inputs from the database, shared by the
// four documents and by the confirmation email's twin in
// features/media/emails/service.ts.
//
// THE COMPOSED READ IS STILL THE RIGHT READ HERE. The templates want an order
// put back together - lines with their scrap weights and their bullion names,
// the shipment, the address - and that is what read.service.ts assembles.
// What changed is who assembles it and from what: the server, from its own
// tables, rather than the browser from a response it was handed.
import * as purchaseOrderReads from "#features/purchase-orders/read.service.ts";
import * as salesOrderReads from "#features/sales-orders/read.service.ts";
import * as purchaseOrderService from "#features/purchase-orders/service.ts";
import * as salesOrderService from "#features/sales-orders/service.ts";
import * as spots from "#features/purchase-orders/repo.dual.js";
import * as packages from "#features/shipping/packages/repo.ts";
import * as shipmentOrderRead from "#features/shipping/shipments/order-read.ts";

// Thrown rather than never-returning: TypeScript only narrows past a
// never-returning call when the VARIABLE carries the annotation, and an
// `if (!x) notFound(id)` that does not narrow leaves every caller below
// holding a possibly-null order.
const notFound = (order_id: string): Error => {
  const err: Error & { statusCode?: number } = new Error(`no order ${order_id}`);
  err.statusCode = 404;
  return err;
};

// The box the parcel was actually booked with. The browser used to guess it
// by matching a hard-coded option list against the shipment's package LABEL;
// shipping.shipments names the row by id and shipping.packages holds the
// label and the dimensions the packing list prints.
export async function packageDetailsFor(order_id: string) {
  const [shipment] = await shipmentOrderRead.getForOrder(order_id);
  if (!shipment?.package_id) return undefined;
  const pkg = await packages.getOne(shipment.package_id);
  if (!pkg) return undefined;
  return {
    label: pkg.label,
    dimensions: {
      length: Number(pkg.length),
      width: Number(pkg.width),
      height: Number(pkg.height),
    },
  };
}

export async function packingListInputs(order_id: string) {
  const purchaseOrder = await purchaseOrderReads.findById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return {
    purchaseOrder,
    spotPrices: await spots.getCurrentSpotPrices(),
    packageDetails: await packageDetailsFor(order_id),
  };
}

export async function returnPackingListInputs(order_id: string) {
  const purchaseOrder = await purchaseOrderReads.findById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return { purchaseOrder, spotPrices: await spots.getCurrentSpotPrices() };
}

// The invoice prints the spots the order was QUOTED at, not today's - which
// is the whole reason orders.spots exists - alongside the live feed the
// preview compares against. getMetalsForOrder speaks the converted names
// (`name` / `ask` / `bid`) the templates read.
export async function invoiceInputs(order_id: string) {
  const purchaseOrder = await purchaseOrderReads.findById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return {
    purchaseOrder,
    spotPrices: await spots.getCurrentSpotPrices(),
    orderSpots: await purchaseOrderService.getMetalsForOrder(order_id),
  };
}

export async function salesOrderInvoiceInputs(order_id: string) {
  const salesOrder = await salesOrderReads.findById(order_id);
  if (!salesOrder) throw notFound(order_id);
  return { salesOrder, spots: await salesOrderService.getMetalsForOrder(order_id) };
}
