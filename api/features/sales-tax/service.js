import * as taxRepo from "#features/sales-tax/repo.js";
import * as spotsService from "#features/spots/service.js";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#features/sales-orders/utils/calculations.ts";

export async function attachSalesTaxToItems(state_code, items, spots) {
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

// `spots` IS IGNORED IF THE CALLER SENDS IT. The tax on a line is a percentage
// of what the line is worth, and what it is worth is content * spot * premium -
// so a caller supplying its own spots was supplying its own tax base. The
// server's spots are the only ones used.
//
// The parameter is not accepted at all rather than accepted-and-overwritten, so
// a reader cannot mistake it for something that still has an effect.
export async function getSalesTax({ address, items }) {
  const spots = await spotsService.getPricingSpots();
  const items_with_tax = await attachSalesTaxToItems(
    address.state,
    items,
    spots
  );
  return calculateSalesTax(items_with_tax, spots);
}

export async function updateStateSalesTax(amount, state) {
  await taxRepo.updateStateSalesTax(amount, state);
}

export async function isNexus(state) {
  return await taxRepo.isNexus(state);
}
