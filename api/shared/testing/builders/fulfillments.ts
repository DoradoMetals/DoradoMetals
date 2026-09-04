// aHandover - the draft fulfillment a checkout points at, and its choices.
//
// RULINGS 69/70 (migration 128): the nine columns that used to describe how an
// order would be handed over left `checkout.checkouts` for the detail row of
// the draft. So a checkout that can be PLACED needs a draft, and a draft needs
// its category's choices - which is three tables and a link, and was one UPDATE.
// This is that setup, once, so no test writes it again.
//
// Through the SERVICE, not the repos: createDraft is what writes the empty
// detail row, and patchChoices is what refuses a patch aimed at the wrong
// category. A fixture that inserted the rows itself would prove neither.
import type { PoolClient } from "pg";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import { fulfillmentMethodId } from "#shared/testing/builders/reference.ts";
import type { Direction, FulfillmentPatchBody, FulfillmentView } from "@dorado/contracts";

// The options are written out here rather than named: `method` is a
// fulfillment method's TYPE and `choices` is one of three category patches, so
// this is not any one table's patch shape and lint:input-shapes is right to
// refuse a local alias for it.
export async function aHandover(
  c: PoolClient,
  checkout_id: string,
  options: {
    // The fulfillment METHOD by type - "CARRIER DROPOFF" unless the test is
    // about a courier pickup, a collection or a store visit.
    method?: string;
    direction?: Direction;
    choices?: FulfillmentPatchBody;
  } = {}
): Promise<FulfillmentView> {
  const direction = options.direction ?? "purchase";
  const draft = await fulfillmentService.createDraft(
    {
      method_id: await fulfillmentMethodId(
        c, options.method ?? "CARRIER DROPOFF", direction
      ),
      direction,
    },
    c
  );
  await checkouts.update(checkout_id, { fulfillment_id: draft.fulfillment.id }, c);
  if (!options.choices) return draft;
  return await fulfillmentService.patchChoices(draft.fulfillment.id, options.choices, c);
}
