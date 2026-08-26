import * as taxRepo from "#features/sales-tax/repo.js";
import * as spotsService from "#features/spots/service.ts";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#features/sales-orders/utils/calculations.ts";
import type { SpotPriceWire } from "@dorado/contracts";

// An order line as the tax calculation reads it. Deliberately loose: this
// arrives as req.body and the calculations pick out what they need, so
// constraining it here would be a claim about the request that nothing checks.
export type TaxableItem = Record<string, unknown>;

// `state_code` IS NULLABLE BECAUSE ADDRESSES ARE. exchange.addresses.state is
// nullable and production uses it - sales order 1f3e9efe has an address with no
// state. A null state matches no rule and the query COALESCEs the rate to 0,
// which is the behaviour that already existed; the type now says so instead of
// the caller having to pass a lie. It is NOT the same thing as the 4e5b97e0
// defect, where an undefined state came from reading `.state` off a list - that
// was a mistake, this is a real address that genuinely has no state.
export async function attachSalesTaxToItems(
  state_code: string | null,
  items: TaxableItem[],
  spots: SpotPriceWire[]
): Promise<(TaxableItem & { sales_tax_rate: number })[]> {
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
// a reader cannot mistake it for something that still has an effect. The type
// enforces that now: a caller passing `spots` is a compile error, not a
// silently discarded field.
export async function getSalesTax({
  address,
  items,
}: {
  address: { state: string };
  items: TaxableItem[];
}): Promise<number> {
  const spots = await spotsService.getPricingSpots();
  const items_with_tax = await attachSalesTaxToItems(
    address.state,
    items,
    spots
  );
  return calculateSalesTax(items_with_tax, spots);
}

export async function updateStateSalesTax(amount: number, state: string): Promise<void> {
  await taxRepo.updateStateSalesTax(amount, state);
}

export async function isNexus(state: string): Promise<boolean> {
  return await taxRepo.isNexus(state);
}
