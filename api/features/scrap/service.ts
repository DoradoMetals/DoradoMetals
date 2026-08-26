// Scrap lines on a purchase order.
//
// There is no repo.next here: scrap has no schema switch. In the new design a
// scrap line has no row of its own at all - its values sit on orders.items and
// `bullion_id IS NULL` is what makes a line scrap - so there is nothing to
// switch between and no second implementation to keep in step.
import * as scrapRepo from "#features/scrap/repo.js";
import type { QueryResult } from "pg";

export async function updateScrapItem({ item }: { item: unknown }): Promise<unknown> {
  return await scrapRepo.updateScrapItem({ item });
}

// `orderId` was never defined here - it was a ReferenceError the moment this
// was called, and the repo takes the array of scrap ids the caller destructures.
export async function deleteItems({ ids }: { ids: string[] }): Promise<QueryResult> {
  return scrapRepo.deleteItems(ids);
}
