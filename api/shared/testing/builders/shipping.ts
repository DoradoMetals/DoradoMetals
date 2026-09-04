import type { PoolClient } from "pg";
import { anId } from "#shared/testing/builders/ids.ts";
import * as shipments from "#db/shipping/shipments/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as fulfillmentShipments from "#db/fulfillments/shipments/repo.ts";
import {
  carrierServiceId, packageId, fulfillmentMethodId, shipmentDirection,
} from "#shared/testing/builders/reference.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";

export type BuiltShipment = {
  id: string;
  order_id: string;
  fulfillment_id: string;
  tracking_number: string;
  carrier_service_id: string;
  package_id: string;
};

export type ShipmentOptions = {
  id?: string;
  tracking_number?: string;
  shipping_status?: string | null;
  method?: string;
  fulfillment_status?: string;
  cost?: number | null;
  insured?: boolean | null;
  declared_value?: number | null;
  label?: string | null;
  label_type?: string | null;
  pickup_type?: string | null;
};

export async function aShipment(
  c: PoolClient,
  order: BuiltOrder | { id: string; direction: "purchase" | "sale" },
  options: ShipmentOptions = {}
): Promise<BuiltShipment> {
  const carrier_service_id = await carrierServiceId(c);
  const package_id = await packageId(c);
  const id = options.id ?? anId();
  const tracking_number = options.tracking_number ?? `7941${id.slice(0, 8)}`.slice(0, 12);

  await shipments.create(
    {
      id,
      direction: shipmentDirection(order.direction),
      tracking_number,
      shipping_status: options.shipping_status ?? "Label Created",
      label: options.label ?? null,
      label_type: options.label_type ?? null,
      pickup_type: options.pickup_type ?? null,
      package_id,
      carrier_service_id,
      cost: options.cost ?? 24.5,
      insured: options.insured ?? true,
      declared_value: options.declared_value ?? 2500,
    },
    c
  );

  const method_id = await fulfillmentMethodId(
    c, options.method ?? "CARRIER DROPOFF", order.direction
  );
  const fulfillment_id = anId();
  await fulfillments.create(
    {
      id: fulfillment_id, order_id: order.id, method_id,
      status: options.fulfillment_status ?? "Pending",
    },
    c
  );
  await fulfillmentShipments.create(
    { id: anId(), fulfillment_id, shipment_id: id },
    c
  );

  return { id, order_id: order.id, fulfillment_id, tracking_number, carrier_service_id, package_id };
}
