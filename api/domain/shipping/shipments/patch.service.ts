// PATCH /api/shipments/:id - a parcel's money and its tracking, keyed by the shipment id the wire already serves.
// shipping_charge is ORDER-scoped (updates every parcel on the order, on purpose - see sql/set_charge_for_order.sql); shipping_actual and tracking each refuse when the shipment has no purchase/sales order to attach to.
import * as shipmentsService from "#domain/shipping/shipments/service.ts";
import * as purchaseOrderService from "#domain/orders/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import * as salesOrderService from "#domain/orders/service.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import type { ShipmentPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => refuseWith(statusCode, message);

// shipping_charge is `number`, not nullable - a cleared charge was never distinguishable from a zero one (every reader does `?? 0`), so a null capability was a second spelling of 0.
export type { ShipmentPatch } from "@dorado/contracts";

// Shape validation happens once, at the transport boundary (transport/shipping/shipments/controller.ts) - what's left here is a RULE: a patch must name at least one field.
export async function patchShipment(
  shipmentId: string,
  body: ShipmentPatch
): Promise<{ success: true }> {
  if (Object.keys(body).length === 0) {
    refuseWith(400, "the document names no field to write");
  }

  const shipment = await shipmentsService.getById(shipmentId);
  if (!shipment) refuse(404, `no shipment ${shipmentId}`);

  // The row carries no order id - which order this shipment belongs to, and its direction, is resolution rather than shape.
  const link = await shipmentsService.getOrderLink(shipmentId);
  const purchaseOrderId = link?.direction === "purchase" ? link.order_id : null;
  const salesOrderId = link?.direction === "sale" ? link.order_id : null;

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
