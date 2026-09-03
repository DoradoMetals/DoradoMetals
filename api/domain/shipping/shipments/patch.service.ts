// PATCH /api/shipments/:id - a parcel's money and its tracking, keyed by the shipment id the wire already serves.
// shipping_charge is ORDER-scoped (updates every parcel on the order, on purpose - see sql/set_charge_for_order.sql); shipping_actual and tracking each refuse when the shipment has no purchase/sales order to attach to.
import * as shipmentsService from "#domain/shipping/shipments/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { updateTracking } from "#domain/orders/service.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import type { shipping } from "@dorado/contracts";

// shipping_charge is `number`, not nullable - a cleared charge was never distinguishable from a zero one (every reader does `?? 0`), so a null capability was a second spelling of 0.
export type ShipmentPatch = shipping.shipments.Patch;

// Shape validation happens once, at the transport boundary (transport/shipping/shipments/controller.ts) - what's left here is a RULE: a patch must name at least one field.
export async function patchShipment(
  shipmentId: string,
  body: shipping.shipments.Patch
): Promise<{ success: true }> {
  if (Object.keys(body).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  // The tracking pair travels together: a number with no carrier (or the
  // reverse) is half a write.
  if ((body.tracking_number === undefined) !== (body.carrier_id === undefined)) {
    throw new Invalid(`"tracking_number" and "carrier_id" travel together`);
  }

  const shipment = await shipmentsService.getById(shipmentId);
  if (!shipment) throw new NotFound(`no shipment ${shipmentId}`);

  // The row carries no order id - which order this shipment belongs to, and its direction, is resolution rather than shape.
  const link = await shipmentsService.getOrderLink(shipmentId);
  const purchaseOrderId = link?.direction === "purchase" ? link.order_id : null;
  const salesOrderId = link?.direction === "sale" ? link.order_id : null;

  if (body.shipping_charge !== undefined) {
    const orderId = purchaseOrderId ?? salesOrderId;
    if (!orderId) {
      throw new Invalid(`shipment ${shipmentId} belongs to no order, so it has no charge to edit`);
    }
    // shipping.shipments belongs to this feature, so the charge is written
    // through its own service rather than through orders.
    await shipmentsService.setChargeForOrder(orderId!, body.shipping_charge);
  }

  if (body.shipping_actual !== undefined) {
    if (!purchaseOrderId) {
      throw new Invalid(`shipment ${shipmentId} has no purchase order to record an actual cost on`);
    }
    // orders.transactions.shipping_fee_actual, through that table's one update.
    await orderTransactions.update(purchaseOrderId!, { shipping_fee_actual: body.shipping_actual });
  }

  if (body.tracking_number !== undefined) {
    if (!salesOrderId) {
      throw new Invalid(`shipment ${shipmentId} has no sales order - tracking is recorded on sales-order shipments`);
    }
    // `carrier_id` names nothing this table stores directly - it always
    // resolved to carrier_service_id through a service NAME, which this write
    // does not change - so it is not passed on.
    await updateTracking(salesOrderId!, body.tracking_number);
  }

  return { success: true };
}
