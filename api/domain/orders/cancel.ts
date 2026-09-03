// Cancelling a purchase order: the customer's metal goes back.
//
// A LABEL IS BILLABLE AND CANNOT BE ROLLED BACK, so it is bought BEFORE the
// transaction and voided if the database work fails. Voiding is idempotent.
//
// NO STATUS WRITE: statuses are labels, never side effects (Jacob). The
// 'Cancelled' label is the admin's own field, which the PATCH runs last.
import * as ordersRepo from "#db/orders/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as shippingOperations from "#domain/shipping/operations/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { DORADO_ADDRESS, FEDEX_CARRIER_ID } from "#providers/shipments/constants.ts";

export async function cancelOrder({
  order,
  return_shipment,
}: {
  order: { id: string };
  // Opaque to the API: the drawer's form, handed straight to the carrier.
  // Narrowing it here would mean importing UI policy.
  return_shipment: Record<string, any>;
}): Promise<{ returnShipment: unknown }> {
  const labelData = await shippingOps.createLabel(FEDEX_CARRIER_ID, undefined, {
    shipper: {
      contact: {
        personName: process.env.FEDEX_DORADO_NAME,
        phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
      },
      address: DORADO_ADDRESS,
    },
    recipient: {
      contact: {
        // recipient_name is WHO RECEIVES THE PARCEL, not a book nickname (D84).
        personName: return_shipment.address.recipient_name,
        phoneNumber: return_shipment.address.phone_number,
      },
      address: return_shipment.address,
    },
    serviceType: return_shipment.service?.serviceType,
    pickupType: return_shipment.pickup?.label,
    pkg: {
      weight: return_shipment.package?.weight,
      dimensions: return_shipment.package?.dimensions,
    },
    insurance: { declaredValue: return_shipment.insurance?.declaredValue },
  });

  const labelBuffer = await shippingOperations.labelBufferOrVoid(labelData);

  try {
    return await withTransaction(async (client) => {
      await ordersRepo.update(order.id, { spots_locked: false }, {}, client);

      // THE BID ONLY: the ask is what the same metal sells for, and clearing it
      // would lose a number this unpin never owned.
      for (const spot of await orderSpots.getRowsFor(order.id, client)) {
        await orderSpots.update(order.id, spot.metal_id, { bid: null }, client);
      }

      const shipment = await shipmentService.create(
        { purchase_order_id: order.id, carrier_id: FEDEX_CARRIER_ID, type: "Return" },
        client
      );
      if (!shipment) throw new Error("the return shipment was not created");

      const updatedShipment = await shipmentService.update(
        {
          id: shipment.id,
          tracking_number: labelData.tracking_number,
          carrier_id: FEDEX_CARRIER_ID,
          shipping_status: "Label Created",
          shipping_label: labelBuffer,
          label_type: "Generated",
          pickup_type: return_shipment.pickup?.name,
          package: return_shipment.package?.label,
          service_type: return_shipment.service?.serviceDescription,
          net_charge: return_shipment.service?.netCharge,
          insured: return_shipment.insurance?.insured,
          declared_value: return_shipment.insurance?.declaredValue?.amount,
          type: "Return",
        },
        client
      );

      return { returnShipment: updatedShipment };
    });
  } catch (err) {
    await shippingOperations.voidLabel(labelData.tracking_number);
    throw err;
  }
}
