// PATCH /api/shipments/:id - a parcel's money and its tracking, keyed by the shipment id the wire already serves.
// shipping_charge is ORDER-scoped (updates every parcel on the order, on purpose - see sql/set_charge_for_order.sql); shipping_actual and tracking each refuse when the shipment has no purchase/sales order to attach to.
import * as shipmentsService from "#domain/shipping/shipments/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { updateTracking } from "#domain/orders/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { ShipmentPatch } from "@dorado/contracts";

// shipping_charge is `number`, not nullable - a cleared charge was never distinguishable from a zero one (every reader does `?? 0`), so a null capability was a second spelling of 0.

// Shape validation happens once, at the transport boundary (transport/shipping/shipments/controller.ts) - what's left here is a RULE: a patch must name at least one field.
export async function patchShipment(
  shipmentId: string,
  body: ShipmentPatch
): Promise<{ success: true }> {
  rules.assertPatchNamesAField(body);
  rules.assertTrackingPair(body.tracking_number, body.carrier_id);

  const shipment = await shipmentsService.getById(shipmentId);
  rules.assertShipment(shipment, shipmentId);

  // The row carries no order id - which order this shipment belongs to, and its direction, is resolution rather than shape.
  const link = await shipmentsService.getOrderLink(shipmentId);
  const purchaseOrderId = link?.direction === "purchase" ? link.order_id : null;
  const salesOrderId = link?.direction === "sale" ? link.order_id : null;

  if (body.shipping_charge !== undefined) {
    const orderId = purchaseOrderId ?? salesOrderId;
    rules.assertChargeableOrder(orderId, shipmentId);
    const charge = body.shipping_charge;
    // shipping.shipments belongs to this feature, so the charge is written
    // through its own service rather than through orders.
    await withTransaction((tx) => shipmentsService.setChargeForOrder(orderId, charge, tx));
  }

  if (body.shipping_actual !== undefined) {
    rules.assertPurchaseOrder(purchaseOrderId, shipmentId);
    // orders.transactions.shipping_fee_actual, through that table's one update.
    await orderTransactions.update(purchaseOrderId!, { shipping_fee_actual: body.shipping_actual });
  }

  if (body.tracking_number !== undefined) {
    rules.assertSalesOrder(salesOrderId, shipmentId);
    // `carrier_id` names nothing this table stores directly - it always
    // resolved to carrier_service_id through a service NAME, which this write
    // does not change - so it is not passed on.
    await updateTracking(salesOrderId!, body.tracking_number);
  }

  return { success: true };
}
