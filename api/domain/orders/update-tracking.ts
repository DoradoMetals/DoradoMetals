// Record a tracking number an admin was given by hand.
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";

export async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
}: {
  order_id: string;
  shipment_id: string;
  tracking_number: string;
}): Promise<{ success: true }> {
  const shipment = await shipmentService.getById(shipment_id);
  if (!shipment) refuse(404, `no shipment ${shipment_id}`);

  // patch(), not update(): the row carries no service NAME to resolve against,
  // so this preserves carrier_service_id / package_id verbatim.
  await shipmentService.patch(shipment_id, { tracking_number });
  // The flag write needs a transaction even alone: the audit actor reaches the
  // connection through withTransaction's set_config and nowhere else.
  await withTransaction((client) =>
    ordersRepo.update(order_id, { tracking_updated: true }, {}, client)
  );
  return { success: true };
}
