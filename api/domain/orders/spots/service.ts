import * as ordersRepo from "#db/orders/repo.ts";
import * as spotsRepo from "#db/orders/spots/repo.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import * as rules from "#domain/orders/rules.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { OrderSpot, OrderSpotNamed, OrderSpotsPutBody } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

export async function rowsFor(
  orderId: string, executor?: Executor
): Promise<OrderSpot[]> {
  return await spotsRepo.getRowsFor(orderId, executor);
}

export async function namedFor(
  orderId: string, executor?: Executor
): Promise<OrderSpotNamed[]> {
  return await spotsRepo.getFor(orderId, executor);
}

export async function setSpots(
  orderId: string, body: OrderSpotsPutBody
): Promise<OrderSpotNamed[]> {
  rules.assertDirection(await ordersRepo.directionOf(orderId), "purchase", "the spots PUT");
  rules.assertNamesASpotField(body);

  const live = body.lock === true ? await spotsFeed.getSpotPrices() : [];
  const bidByMetal = new Map(live.map((quote) => [quote.id, quote.bid]));

  await withTransaction(async (tx) => {
    if (body.lock !== undefined) {
      await ordersRepo.update(orderId, { spots_locked: body.lock }, {}, tx);
      for (const row of await spotsRepo.getRowsFor(orderId, tx)) {
        await spotsRepo.update(
          orderId,
          row.metal_id,
          { bid: body.lock === true ? (bidByMetal.get(row.metal_id) ?? null) : null },
          tx
        );
      }
    }

    for (const edit of body.set ?? []) {
      await spotsRepo.update(orderId, edit.metal_id, { bid: edit.bid }, tx);
    }
  });

  return await namedFor(orderId);
}
