import * as scrapRepo from "#features/scrap/repo.js"

export async function updateScrapItem({ item }) {
  return await scrapRepo.updateScrapItem({ item });
}

// `orderId` was never defined here - it was a ReferenceError the moment this
// was called, and the repo takes the array of scrap ids the caller destructures.
export async function deleteItems({ ids }) {
  return scrapRepo.deleteItems(ids);
}
