import * as scrapRepo from "#features/scrap/repo.js"

export async function updateScrapItem({ item }) {
  return await scrapRepo.updateScrapItem({ item });
}

export async function deleteItems({ ids }) {
  return scrapRepo.deleteItems(orderId);
}
