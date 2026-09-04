import * as shipmentsService from "#domain/shipping/shipments/service.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import { updateTracking } from "#domain/orders/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as rules from "#domain/shipping/rules.ts";
import type { ShipmentPatch } from "@dorado/contracts";

export async function patchShipment(
  shipmentId: string,
  body: ShipmentPatch
): Promise<{ success: true }> {
  rules.assertPatchNamesAField(body);
  rules.assertTrackingPair(body.tracking_number, body.carrier_id);

  const shipment = await shipmentsService.getById(shipmentId);
  rules.assertShipment(shipment, shipmentId);

  const link = await shipmentsService.getOrderLink(shipmentId);
  const purchaseOrderId = link?.direction === "purchase" ? link.order_id : null;
  const salesOrderId = link?.direction === "sale" ? link.order_id : null;

  if (body.shipping_charge !== undefined) {
    const orderId = purchaseOrderId ?? salesOrderId;
    rules.assertChargeableOrder(orderId, shipmentId);
    const charge = body.shipping_charge;
    await withTransaction((tx) => shipmentsService.setChargeForOrder(orderId, charge, tx));
  }

  if (body.shipping_actual !== undefined) {
    rules.assertPurchaseOrder(purchaseOrderId, shipmentId);
    await orderTransactions.update(purchaseOrderId!, { shipping_fee_actual: body.shipping_actual });
  }

  if (body.tracking_number !== undefined) {
    rules.assertSalesOrder(salesOrderId, shipmentId);
    await updateTracking(salesOrderId!, body.tracking_number);
  }

  return { success: true };
}
