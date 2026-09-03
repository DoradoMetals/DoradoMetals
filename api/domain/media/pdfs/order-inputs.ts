// Every document's inputs, loaded by order id - the server resolves render inputs from its own tables (not the browser), shared by the four PDF routes and the confirmation email's twin (media/emails/service.ts).
// The composed read is still the right read here: templates want an order put back together (lines, shipment, address), which is what read.service.ts assembles.
import * as purchaseOrderReads from "#domain/orders/read.service.ts";
import * as salesOrderReads from "#domain/orders/read.service.ts";
import * as purchaseOrderService from "#domain/orders/service.ts";
import * as salesOrderService from "#domain/orders/service.ts";
// The live spot feed - the same read the pricing paths use (spots.spots, converted names).
import * as spotsFeed from "#domain/spots/service.ts";
import * as packages from "#db/shipping/packages/repo.ts";
import * as shipmentOrderRead from "#domain/shipping/shipments/order-read.ts";

// Thrown rather than never-returning: TS only narrows past a never-returning call when the variable itself carries that annotation, so `if (!x) notFound(id)` alone wouldn't narrow.
const notFound = (order_id: string): Error => {
  const err: Error & { statusCode?: number } = new Error(`no order ${order_id}`);
  err.statusCode = 404;
  return err;
};

// The box the parcel was actually booked with: shipping.shipments names the row by id, shipping.packages holds the label and dimensions the packing list prints.
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
  const purchaseOrder = await purchaseOrderReads.findPurchaseById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return {
    purchaseOrder,
    spotPrices: await spotsFeed.getSpotPrices(),
    packageDetails: await packageDetailsFor(order_id),
  };
}

export async function returnPackingListInputs(order_id: string) {
  const purchaseOrder = await purchaseOrderReads.findPurchaseById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return { purchaseOrder, spotPrices: await spotsFeed.getSpotPrices() };
}

// The invoice prints the spots the order was QUOTED at, not today's (why orders.spots exists), alongside the live feed the preview compares against. getMetalsForOrder speaks the converted names (name/ask/bid) the templates read.
export async function invoiceInputs(order_id: string) {
  const purchaseOrder = await purchaseOrderReads.findPurchaseById(order_id);
  if (!purchaseOrder) throw notFound(order_id);
  return {
    purchaseOrder,
    spotPrices: await spotsFeed.getSpotPrices(),
    orderSpots: await purchaseOrderService.getPurchaseMetalsForOrder(order_id),
  };
}

export async function salesOrderInvoiceInputs(order_id: string) {
  const salesOrder = await salesOrderReads.findSaleById(order_id);
  if (!salesOrder) throw notFound(order_id);
  return { salesOrder, spots: await salesOrderService.getSalesMetalsForOrder(order_id) };
}
