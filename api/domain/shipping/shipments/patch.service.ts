// PATCH /api/shipments/:id - a parcel's money and its tracking, keyed by the
// shipment id the wire already serves (order.shipment.id).
//
// Jacob's principle, final form (28 August): one endpoint per RESOURCE, owned
// by its feature. The shipping charge, the actual shipping cost, and the
// tracking pair are all shipment-side facts that used to ride order routes;
// each dispatches to the SAME service the old route called - routing moved,
// logic did not.
//
// KEYING, honestly stated:
//
//   shipping_charge   the legacy write is ORDER-scoped (`WHERE
//                     purchase_order_id = $1` updates every parcel on the
//                     order, and the new-schema statement mirrors that on
//                     purpose - see sql/set_charge_for_order.sql). The
//                     shipment id ADDRESSES the resource; its order scopes
//                     the write, exactly as it always did.
//   shipping_actual   an ORDER column (exchange.purchase_orders
//                     .shipping_fee_actual) reached through the parcel -
//                     refused on a shipment with no purchase order.
//   tracking          the sales-order tracking write, flag included -
//                     refused on a shipment with no sales order, because
//                     that is the only tracking write that exists today.
import * as shipmentsService from "#domain/shipping/shipments/service.ts";
import * as purchaseOrderService from "#domain/orders/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import * as salesOrderService from "#domain/orders/service.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { ShipmentPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

// THE BODY IS THE CONTRACT'S (A3), AND ONE FIELD CHANGED MEANING IN THE MOVE.
// `shipping_charge` was `number | null` here and `number` in
// frontend/features/shipping/queries.ts, so the API advertised a CLEAR the only
// client could not compile a call to. The null is gone rather than the
// frontend's type being widened, because nothing below this line ever honoured
// it: editShippingCharge takes `shipping_charge: number` and this file reached
// it through `as number`. And a cleared charge is not distinguishable from a
// zero one - every reader is `?? 0` - so the capability was a second spelling
// of 0, on a stored fee that D117 says is a record.
export type { ShipmentPatch } from "@dorado/contracts";

const FIELDS = Object.keys(ShipmentPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a shipment PATCH");
  if (unknown) return unknown;
  const present = Object.keys(body ?? {});
  if (present.length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  // The tracking pair travels together: a number with no carrier (or the
  // reverse) is half a write the old route never made.
  if ((body.tracking_number === undefined) !== (body.carrier_id === undefined)) {
    return {
      statusCode: 400,
      message: `"tracking_number" and "carrier_id" travel together`,
    };
  }
  return refusedValue(ShipmentPatch, body ?? {});
}

export async function patchShipment(
  shipmentId: string,
  body: ShipmentPatch & Record<string, unknown>
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  const shipment = await shipmentsService.getById(shipmentId);
  if (!shipment) refuse(404, `no shipment ${shipmentId}`);

  const purchaseOrderId = shipment!.purchase_order_id;
  const salesOrderId = shipment!.sales_order_id;

  if (body.shipping_charge !== undefined) {
    const orderId = purchaseOrderId ?? salesOrderId;
    if (!orderId) {
      refuse(422, `shipment ${shipmentId} belongs to no order, so it has no charge to edit`);
    }
    await purchaseOrderService.editShippingCharge({
      order_id: orderId!,
      shipping_charge: body.shipping_charge,
    });
  }

  if (body.shipping_actual !== undefined) {
    if (!purchaseOrderId) {
      refuse(422, `shipment ${shipmentId} has no purchase order to record an actual cost on`);
    }
    // orders.transactions.shipping_fee_actual, through that table's one update.
    await orderTransactions.update(purchaseOrderId!, { shipping_fee_actual: body.shipping_actual });
  }

  if (body.tracking_number !== undefined) {
    if (!salesOrderId) {
      refuse(422, `shipment ${shipmentId} has no sales order - tracking is recorded on sales-order shipments`);
    }
    await salesOrderService.updateTracking({
      order_id: salesOrderId!,
      shipment_id: shipmentId,
      tracking_number: body.tracking_number,
      carrier_id: body.carrier_id as string,
    });
  }

  return { success: true };
}
