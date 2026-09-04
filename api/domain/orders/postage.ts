// THE CARRIER SIDE OF A LABEL: buying it, booking the courier if the parcel
// needs one, and writing both onto rows a transaction already committed.
// Shared by place.ts's own first buy and orders.buyLabel's retry so the two
// AFTER phases cannot drift on what a label touches or how it is written.
//
// NO COMPENSATION ON A PARTIAL FAILURE: a void does not un-bill a label, so
// nothing here tries. Whatever buyPostage throws propagates untouched, and
// whatever it already bought before throwing is simply never recorded -
// exactly like a network call that never returned. The row it would have
// updated stands as the WRITE step left it, and calling the buy again is the
// retry (orders.buyLabel, or place's own request failing outright).
import withTransaction from "#shared/db/withTransaction.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as pickupService from "#domain/shipping/pickups/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
import * as shippingOperations from "#domain/shipping/operations/service.ts";
import * as rules from "#domain/orders/rules.ts";
import type { AddressRow } from "#db/places/addresses/repo.ts";

// A stub answers the same shape with no tracking number, and voiding nothing
// is what labelBufferOrVoid already does for a genuinely empty response.
export type Postage = {
  netCharge: number;
  tracking_number: string | null;
  label: Buffer | null;
  pickup: { confirmationNumber: string | null; location: string | null } | null;
};

// THE CARRIER, ASKED IN ORDER: the postage price, the label that costs it, the
// courier if one is coming.
export async function buyPostage(
  shipper: AddressRow, personName: string, parcel: rules.Parcel
): Promise<Postage> {
  const netCharge = rules.quotedCharge(
    await shippingOperations.quoteRate(rules.rateRequest(shipper, parcel)), parcel.serviceType
  );
  const labelData = await shippingOps.createLabel(
    parcel.carrier_id, undefined, rules.labelRequest(shipper, personName, parcel)
  );
  const label = await shippingOperations.labelBufferOrVoid(labelData);
  const tracking_number = labelData.tracking_number;
  if (!parcel.schedule) return { netCharge, tracking_number, label, pickup: null };

  const pickup = await shippingOps.createPickup(
    parcel.carrier_id, undefined,
    rules.pickupRequest(shipper, personName, parcel, parcel.schedule, tracking_number)
  );
  return { netCharge, tracking_number, label, pickup };
}

// THE ONE PLACE A BOUGHT LABEL GETS WRITTEN DOWN: the quoted charge, the
// shipment's own label columns, and the courier booking if there is one - one
// small transaction, called only after the carrier has already answered.
export async function recordPostage(
  order_id: string,
  shipment_id: string,
  postage: Postage,
  schedule: { date: string; time: string } | null
): Promise<void> {
  await withTransaction(async (tx) => {
    await orderTransactions.update(order_id, { shipping: postage.netCharge }, {}, tx);
    await shipmentService.update(
      shipment_id,
      {
        tracking_number: postage.tracking_number, label: postage.label,
        label_type: "Generated", shipping_status: "Label Created", cost: postage.netCharge,
      },
      tx
    );
    if (postage.pickup && schedule) {
      await pickupService.recordForShipment(
        {
          shipment_id, date: schedule.date, time: schedule.time,
          confirmation_number: postage.pickup.confirmationNumber, location: postage.pickup.location,
        },
        tx
      );
    }
  });
}
