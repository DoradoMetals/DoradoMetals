// Sales tax: nexus, the rule match, and the running total. The match moved OUT of SQL (see match.ts) — 88 rules read once and ranked in TypeScript, testable without a database, which matters most here since this decides what a customer is charged.
// COLLECTING_NEXUS_TAXES is false in production — the early return below never fires, so every state's rules are consulted. Preserved rather than simplified: flipping it on is a business decision, and the branch must still exist when it happens.
import * as tax from "#db/sales-tax/repo.ts";
import { rateFor, type TaxableFacts } from "#domain/sales-tax/match.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { TaxRule } from "#db/sales-tax/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import * as spotsService from "#domain/spots/service.ts";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#domain/pricing/service.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";

export async function isNexus(state: string, executor?: Executor): Promise<boolean> {
  return await tax.reachedNexus(state, executor);
}

// Read once — a caller pricing a whole order should fetch rules once and pass them to rateFor per line, not query per item.
export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  return await tax.allRules(executor);
}

// One line's rate — kept for pricing a single item, named apart from the order-level getSalesTax below.
export async function rateForItem(
  state: string | null,
  item: Record<string, unknown>,
  item_price: number,
  item_total: number,
  executor?: Executor
): Promise<number> {
  const collectingNexus = process.env.COLLECTING_NEXUS_TAXES === "true";
  if (collectingNexus && state !== null && !(await isNexus(state, executor))) return 0;

  const rules = await tax.allRules(executor);
  return rateFor(rules, factsFrom(state, item, item_price, item_total));
}

// The nine values the statement took as parameters, in one place. `item` is
// req.body and deliberately loose - the previous implementation read these same
// fields off it with no type at all.
export function factsFrom(
  state: string | null,
  item: Record<string, unknown>,
  item_price: number,
  item_total: number
): TaxableFacts {
  return {
    state_code: state,
    metal_category: (item.metal_type as string) ?? null,
    // BOTH SPELLINGS, DELIBERATELY: the get_sales_tax endpoint sends req.body's `product_type`, order-create paths send getItemsFromServer's rows, which carry products.bullion's own `type`. Reading only the legacy name left every server-fetched item NULL here, silently falling through to the 'All' rate — a real tax bug found during the products conversion.
    // Legacy name checked FIRST: a cart item's own `type` field is its kind ("product"/"scrap"), never a product type.
    product_type: (item.product_type as string) ?? (item.type as string) ?? null,
    price: item_price,
    purity: Number(item.purity ?? 0),
    aggregate: item_total,
    weight: Number(item.gross ?? 0),
    is_domestic: (item.domestic_tender as boolean) ?? null,
    is_legal_tender: (item.legal_tender as boolean) ?? null,
  };
}

// Rules fetched ONCE and matched in memory — replaces an implementation that ran the whole filter-and-rank query per item (twelve lines, twelve queries over the same 88 rules).
export async function attachSalesTaxToItems(
  state_code: string | null,
  items: Record<string, unknown>[],
  spots: PricingSpot[]
): Promise<(Record<string, unknown> & { sales_tax_rate: number })[]> {
  const item_total = calculateItemTotals(items as never, spots as never);

  const collectingNexus = process.env.COLLECTING_NEXUS_TAXES === "true";
  if (collectingNexus && state_code !== null && !(await isNexus(state_code))) {
    return items.map((item) => ({ ...item, sales_tax_rate: 0 }));
  }

  const rules = await tax.allRules();
  return items.map((item) => ({
    ...item,
    sales_tax_rate: rateFor(
      rules,
      factsFrom(state_code, item, calculateItemAsk(item as never, spots as never), item_total)
    ),
  }));
}

// `spots` is IGNORED if the caller sends it — tax is a percentage of content * spot * premium, so a caller supplying its own spots would supply its own tax base. Only the server's spots are ever used; the type enforces it.
export async function getSalesTax({
  address,
  items,
}: {
  address: { state: string };
  items: Record<string, unknown>[];
}): Promise<number> {
  const spots = await spotsService.getSpotPrices();
  const withTax = await attachSalesTaxToItems(address.state, items, spots);
  return calculateSalesTax(withTax as never, spots as never);
}

// The running total a state is owed — the only write this feature makes, threaded through the caller's executor (sales-orders' create transaction) so a rolled-back order never leaves a state owing tax for it.
// State is nullable (addresses can lack one); a null state accrues nothing rather than lying about a rate — both this check and the WHERE clause below already treat 'no state' as 'no tax collected'.
export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  executor?: Executor
): Promise<void> {
  if (state === null) return;
  const write = async (c: Executor) => {
    await tax.accrue(amount, state, c);
  };
  return executor ? write(executor) : withTransaction(write);
}
