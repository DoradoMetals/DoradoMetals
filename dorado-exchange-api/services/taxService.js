const taxRepo = require("../repositories/taxRepo");

const {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} = require("../utils/price-calculations");

async function attachSalesTaxToItems(state_code, items, spots) {
  const item_total = calculateItemTotals(items, spots);

  const promises = items.map(async (item) => ({
    ...item,
    sales_tax_rate: await taxRepo.getSalesTax(
      state_code,
      item,
      calculateItemAsk(item, spots),
      item_total
    ),
  }));

  return Promise.all(promises);
}

async function getSalesTax({ address, items, spots }) {
  const items_with_tax = await attachSalesTaxToItems(address.state, items, spots);
  return calculateSalesTax(items_with_tax, spots);
}

async function updateStateSalesTax(amount, state) {
  await taxRepo.updateStateSalesTax(amount, state)
}

async function isNexus(state) {
  return await taxRepo.isNexus(state)
}

module.exports = {
  attachSalesTaxToItems,
  getSalesTax,
  updateStateSalesTax,
  isNexus,
};
