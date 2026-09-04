// BUYING A CARRIER LABEL, which is shipping's job and not an order's (ruling
// 67, Jacob: "I don't understand why any carrier or shipping stuff is living
// in orders").
//
// ONE DOOR PER LEG, each keyed by the SHIPMENT it labels:
//
//   sealForPlacement   the parcel the draft fulfillment already carries, SEALED
//                      as an order is written: the insured amount and the
//                      handoff are the server's answers, and the choices are
//                      already on the row (rulings 69/70, migration 128)
//   buyLabel           the Inbound label, bought AFTER that commit (and the
//                      admin's retry surface, POST /api/shipments/:id/label)
//   buyReturnLabel     the Return leg an order cancellation asks for
//
// Each LOADS the shell and, through it, the order it belongs to - the address
// snapshot, the lines that set the weight, the total it is insured for - so a
// caller hands over an id and nothing else.
//
// NO COMPENSATION ON A PARTIAL FAILURE: a void does not un-bill a label, so
// nothing here tries. Whatever the carrier throws propagates untouched and
// whatever it already sold is simply never recorded, exactly like a network
// call that never returned. The row stands as the commit left it and calling
// the same door again is the retry.
import * as shipmentsRepo from "#db/shipping/shipments/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as usersRepo from "#db/users/repo.ts";

import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as pickupService from "#domain/shipping/pickups/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as fulfillmentPickups from "#domain/fulfillments/pickups/service.ts";
import * as shippingOps from "#domain/shipping/operations/handler.ts";
import * as shippingOperations from "#domain/shipping/operations/service.ts";
import * as rules from "#domain/shipping/rules.ts";
import * as requests from "#providers/shipments/requests.ts";
import * as checkoutService from "#domain/checkout/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Address, CarrierServiceRead, Parcel, ParcelSchedule } from "@dorado/contracts";

// --------------------------------------------- the parcel a placement seals

// THE PARCEL A PURCHASE IS HANDED OVER AS, SEALED at placement.
//
// It used to be CREATED here, copied whole off the checkout row. Rulings 69/70
// moved the customer's choices onto the parcel itself the moment they pick a
// SHIPMENT (migration 128), so the row already holds the box, the service,
// where it leaves from and the courier slot. What is left is what the SERVER
// decides and only an order can decide: the handoff the chosen method means,
// and the insured amount clamped to that service's ceiling (D132).
//
// The label columns stay null - the carrier has not been asked yet
// (label-after-commit, 2026-09-03) - and `buyLabel` fills them in once it has.
export async function sealForPlacement(
  shipment_id: string, checkout_id: string, method_type: string | null, tx: Executor
): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id, tx);
  rules.assertShipment(shipment, shipment_id);
  rules.assertParcelChosen(shipment, shipment_id);

  const service = await carrierServices.labelServiceFor(shipment.carrier_service_id!, tx);
  const declaredValue = await carrierServices.clampInsuredValue(
    rules.declaredValue(await checkoutService.purchaseTotal(checkout_id, tx)),
    service.code
  );
  const handoff = rules.handoffFor(await handoffsService.getHandoffs(), method_type);
  // Built and thrown away: it is what PROVES the parcel can be labelled - a box
  // that exists, a weight above zero, a courier slot where the handoff needs
  // one - before an order is written against it.
  rules.parcelFor(
    service, await packagesRepo.getOne(shipment.package_id!, tx), handoff, declaredValue,
    rules.parcelWeightLb(
      await checkoutService.getItemsForOrder(checkout_id, tx),
      await packagesRepo.getOne(shipment.package_id!, tx)
    ),
    rules.scheduleOf(shipment.pickup_date, shipment.pickup_time)
  );

  await shipmentsRepo.update(
    shipment_id,
    {
      pickup_type: handoff.name,
      insured: declaredValue > 0,
      declared_value: declaredValue > 0 ? declaredValue : null,
    },
    tx
  );
}

// ------------------------------------------------------------ the label itself

// THE INBOUND LABEL for a shipment that has none. Called by a placement once
// its own transaction has committed, and by POST /api/shipments/:id/label when
// that call failed - the two are the same act, so they are the same function.
//
// THE COURIER SLOT IS A COLUMN NOW (migration 128): the customer's requested
// date and time live on the parcel itself, so a placement and the admin retry
// read the same row rather than one of them passing it in. The order's own
// booked pickup is still the fallback, for a parcel that predates the column.
export async function buyLabel(shipment_id: string): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id);
  rules.assertShipment(shipment, shipment_id);
  rules.assertUnlabelled(shipment.tracking_number, shipment_id);
  rules.assertParcelChosen(shipment, shipment_id);

  const link = await shipmentService.getOrderLink(shipment_id);
  rules.assertLabelledOrder(link, shipment_id);
  const { order_id } = link;

  const handoff = (await handoffsService.getHandoffs())
    .find((h) => h.name === shipment.pickup_type);
  rules.assertHandoff(handoff, shipment_id);

  const parcel = rules.parcelFor(
    await carrierServices.labelServiceFor(shipment.carrier_service_id!),
    await packagesRepo.getOne(shipment.package_id!),
    handoff,
    shipment.declared_value ?? 0,
    rules.parcelWeightLb(await orderItems.getFor(order_id), await boxOf(shipment.package_id)),
    rules.scheduleOf(shipment.pickup_date, shipment.pickup_time)
      ?? rules.scheduleFromPickup((await fulfillmentPickups.forOrder(order_id))[0])
  );

  const shipper = await snapshotOf(order_id, shipment_id);
  const personName = await customerName(order_id);

  // THE CARRIER, ASKED IN ORDER: the postage price, the label that costs it,
  // the courier if one is coming.
  const netCharge = rules.quotedCharge(
    await shippingOperations.quoteRate({
      carrier_id: parcel.carrier_id, shippingType: "Inbound", address: shipper,
      ...requests.rateParcel(parcel),
    }),
    parcel.serviceType
  );
  const labelData = await shippingOps.createLabel(
    parcel.carrier_id, undefined, requests.inboundLabelRequest(shipper, personName, parcel)
  );
  const label = await shippingOperations.labelBufferOrVoid(labelData);
  const booking = parcel.schedule
    ? await shippingOps.createPickup(
        parcel.carrier_id, undefined,
        requests.pickupRequest(
          shipper, personName, parcel, parcel.schedule, labelData.tracking_number
        )
      )
    : null;

  await record(order_id, shipment_id, {
    netCharge, service: parcel.serviceType, tracking_number: labelData.tracking_number,
    label, schedule: parcel.schedule, booking,
  });
}

// THE RETURN LEG: the customer's metal goes back, from the business's own
// configured address to the one the ORDER snapshotted. The shell is already
// committed (an order cancellation writes it), so a carrier failure leaves it
// standing and calling this again reuses it.
export async function buyReturnLabel(shipment_id: string): Promise<void> {
  const shipment = await shipmentsRepo.getOne(shipment_id);
  rules.assertShipment(shipment, shipment_id);
  rules.assertParcelChosen(shipment, shipment_id);

  const link = await shipmentService.getOrderLink(shipment_id);
  rules.assertLabelledOrder(link, shipment_id);
  const { order_id } = link;

  const service = await carrierServices.labelServiceFor(shipment.carrier_service_id!);
  const parcel = rules.parcelFor(
    service, await packagesRepo.getOne(shipment.package_id!),
    // A return is handed to the carrier by us; no customer slot is collected,
    // so the handoff is the one that needs none.
    rules.handoffFor(await handoffsService.getHandoffs(), null),
    shipment.declared_value ?? 0,
    rules.parcelWeightLb(await orderItems.getFor(order_id), await boxOf(shipment.package_id)),
    null
  );

  const labelData = await shippingOps.createLabel(
    parcel.carrier_id, undefined,
    requests.returnLabelRequest(
      await customerName(order_id), await snapshotOf(order_id, shipment_id), parcel
    )
  );
  const label = await shippingOperations.labelBufferOrVoid(labelData);

  await withTransaction((tx) => shipmentService.update(shipment_id, {
    tracking_number: labelData.tracking_number, label,
    label_type: "Generated", shipping_status: "Label Created",
  }, tx));
}

// ------------------------------------------------------------------- the rows

// THE ONE PLACE A BOUGHT LABEL GETS WRITTEN DOWN: the quoted charge and the
// service on the order's totals, the label columns on the parcel, and the
// courier booking if there is one - one small transaction, called only after
// the carrier has already answered.
async function record(
  order_id: string,
  shipment_id: string,
  { netCharge, service, tracking_number, label, schedule, booking }: {
    netCharge: number;
    service: string;
    tracking_number: string | null;
    label: Uint8Array;
    schedule: ParcelSchedule | null;
    booking: { confirmationNumber: string | null; location: string | null } | null;
  }
): Promise<void> {
  await withTransaction(async (tx) => {
    await orderTransactions.update(
      order_id, { shipping: netCharge, shipping_service: service }, {}, tx
    );
    await shipmentService.update(
      shipment_id,
      {
        tracking_number, label, label_type: "Generated",
        shipping_status: "Label Created", cost: netCharge,
      },
      tx
    );
    if (booking && schedule) {
      await pickupService.recordForShipment(
        {
          shipment_id, date: schedule.date, time: schedule.time,
          confirmation_number: booking.confirmationNumber, location: booking.location,
        },
        tx
      );
    }
  });
}

// ----------------------------------------------------------------- the loads

async function boxOf(package_id: string | null) {
  return package_id === null ? undefined : await packagesRepo.getOne(package_id);
}

// WHERE THE PARCEL GOES, or came from: the order's own frozen copy, never the
// book entry it was taken from - editing an address afterwards must not move a
// parcel that has already been sent.
async function snapshotOf(order_id: string, shipment_id: string): Promise<Address> {
  const link = await orderAddresses.getFor(order_id);
  const address = link ? await placeAddresses.getOne(link.address_id) : undefined;
  rules.assertAddress(address, `snapshot for shipment ${shipment_id}`);
  return address;
}

// Who signs for it. Blank rather than refused: a carrier takes an empty
// contact name, and an order with no user is a state the table allows.
async function customerName(order_id: string): Promise<string> {
  const user_id = await ordersRepo.ownerOf(order_id);
  if (!user_id) return "";
  return (await usersRepo.getOne(user_id))?.name ?? "";
}


// WHICH SERVICE A FULFILLMENT'S PARCEL WAS BOOKED WITH. domain/orders asks this
// to price a sale's postage: the choice is the parcel's column (128), and
// resolving a `shipping.services` row from it is shipping's job, not orders'.
export async function serviceForFulfillment(
  fulfillment_id: string, executor?: Executor
): Promise<CarrierServiceRead | undefined> {
  const shipment_id = await fulfillmentService.shipmentIdOf(fulfillment_id, executor);
  if (!shipment_id) return undefined;
  const shipment = await shipmentsRepo.getOne(shipment_id, executor);
  if (!shipment?.carrier_service_id) return undefined;
  return await servicesRepo.getOne(shipment.carrier_service_id, executor);
}
