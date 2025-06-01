const pool = require("../db");
const scrapRepo = require("../repositories/scrapRepository");

async function updateScrapItem({ item }) {
  return await scrapRepo.updateScrapItem({ item });
}

async function deleteItems({ ids }) {
  return scrapRepo.deleteItems(orderId);
}

module.exports = {
  updateScrapItem,
  deleteItems,
};
