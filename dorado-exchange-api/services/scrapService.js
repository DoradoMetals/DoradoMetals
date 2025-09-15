import * as scrapRepo from "../repositories/scrapRepo.js";

export async function updateScrapItem({ item }) {
  return await scrapRepo.updateScrapItem({ item });
}

export async function deleteItems({ ids }) {
  return scrapRepo.deleteItems(orderId);
}
