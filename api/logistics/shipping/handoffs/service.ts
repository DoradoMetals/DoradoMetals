import {
  carrierIdOr,
  resolveCarrier,
} from "#logistics/shipping/operations/resolver.ts";
import type { CarrierHandoff } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

export async function getHandoffs(
  carrier_id?: string | null, client?: Executor
): Promise<CarrierHandoff[]> {
  const id = await carrierIdOr(carrier_id, client);
  const { catalogue } = await resolveCarrier(id, client);

  return [...catalogue.handoffs].sort((a, b) => a.display_order - b.display_order);
}
