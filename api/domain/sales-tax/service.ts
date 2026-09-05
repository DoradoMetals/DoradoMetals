import * as tax from "#db/sales-tax/repo.ts";
import { rateFor, type TaxableFacts } from "#domain/sales-tax/match.ts";
import type { TaxRule } from "#db/sales-tax/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as productService from "#domain/products/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxRules from "#domain/sales-tax/rules.ts";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#domain/pricing/service.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { GetSalesTaxBody } from "@dorado/contracts";

type PriceableLine = {
  metal_type?: string | null;
  content?: number | null;
  ask_premium?: number | null;
  quantity?: number | null;
};

export async function isNexus(state: string, executor?: Executor): Promise<boolean> {
  return await tax.reachedNexus(state, executor);
}

export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  return await tax.allRules(executor);
}

export async function rateForItem(
  state: string | null,
  item: TaxableItem,
  item_price: number,
  item_total: number,
  executor?: Executor
): Promise<number> {
  const collectingNexus = process.env.COLLECTING_NEXUS_TAXES === "true";
  if (collectingNexus && state !== null && !(await isNexus(state, executor))) return 0;

  const rules = await tax.allRules(executor);
  return rateFor(rules, factsFrom(state, item, item_price, item_total));
}

export type TaxableItem = {
  metal_type?: string | null;
  type?: string | null;
  purity?: number | string | null;
  gross?: number | string | null;
  domestic_tender?: boolean | null;
  legal_tender?: boolean | null;
};

export function factsFrom(
  state: string | null,
  item: TaxableItem,
  item_price: number,
  item_total: number
): TaxableFacts {
  return {
    state_code: state,
    metal_category: item.metal_type ?? null,
    product_type: item.type ?? null,
    price: item_price,
    purity: Number(item.purity ?? 0),
    aggregate: item_total,
    weight: Number(item.gross ?? 0),
    is_domestic: item.domestic_tender ?? null,
    is_legal_tender: item.legal_tender ?? null,
  };
}

export async function attachSalesTaxToItems<T extends TaxableItem & PriceableLine>(
  state_code: string | null,
  items: T[],
  spots: PricingSpot[]
): Promise<(T & { sales_tax_rate: number })[]> {
  const item_total = calculateItemTotals(items, spots);
  const taxed = (item: T, sales_tax_rate: number) => ({ ...item, sales_tax_rate });

  const collectingNexus = process.env.COLLECTING_NEXUS_TAXES === "true";
  if (collectingNexus && state_code !== null && !(await isNexus(state_code))) {
    return items.map((item) => taxed(item, 0));
  }

  const rules = await tax.allRules();
  return items.map((item) =>
    taxed(
      item,
      rateFor(rules, factsFrom(state_code, item, calculateItemAsk(item, spots), item_total))
    )
  );
}

export async function getSalesTax(
  { address_id, items }: GetSalesTaxBody
): Promise<number> {
  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  if (address_id) taxRules.assertAddress(address, address_id);

  const spots = await spotsService.getSpotPrices();
  const withTax = await attachSalesTaxToItems(
    address?.state ?? null, await productService.getItemsFromServer(items), spots
  );
  return calculateSalesTax(withTax, spots);
}

export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  tx: Executor
): Promise<void> {
  if (state === null) return;
  await tax.accrue(amount, state, tx);
}
