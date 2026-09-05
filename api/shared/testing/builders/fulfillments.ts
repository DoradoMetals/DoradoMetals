import type { PoolClient } from "pg";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import { fulfillmentMethodId } from "#shared/testing/builders/reference.ts";
import type { Direction, FulfillmentPatchBody, FulfillmentView } from "@dorado/contracts";

export async function aHandover(
  c: PoolClient,
  checkout_id: string,
  options: {
    method?: string;
    direction?: Direction;
    choices?: FulfillmentPatchBody;
  } = {}
): Promise<FulfillmentView> {
  const direction = options.direction ?? "purchase";
  const draft = await fulfillmentService.createDraft(
    await fulfillmentMethodId(c, options.method ?? "CARRIER DROPOFF", direction),
    direction,
    c
  );
  await checkouts.update(checkout_id, { fulfillment_id: draft.fulfillment.id }, c);
  if (!options.choices) return draft;
  return await fulfillmentService.patchChoices(draft.fulfillment.id, options.choices, c);
}
