// Sales tax: nexus, the rule match, and the running total. The match moved OUT of SQL (see match.ts) — 88 rules read once and ranked in TypeScript, testable without a database, which matters most here since this decides what a customer is charged.
// COLLECTING_NEXUS_TAXES is false in production — the early return below never fires, so every state's rules are consulted. Preserved rather than simplified: flipping it on is a business decision, and the branch must still exist when it happens.
import * as tax from "#db/sales-tax/repo.ts";
import { rateFor, type TaxableFacts } from "#domain/sales-tax/match.ts";
import type { TaxRule } from "#db/sales-tax/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as productService from "#domain/products/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import { NotFound } from "#shared/errors.ts";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#domain/pricing/service.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { GetSalesTaxBody } from "@dorado/contracts";

// What the ask side reads off a line. Named here rather than imported because
// pricing does not export it; the fields are its `PriceableItem`.
type PriceableLine = {
  metal_type?: string | null;
  content?: number | null;
  ask_premium?: number | null;
  quantity?: number | null;
};

export async function isNexus(state: string, executor?: Executor): Promise<boolean> {
  return await tax.reachedNexus(state, executor);
}

// Read once — a caller pricing a whole order should fetch rules once and pass them to rateFor per line, not query per item.
export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  return await tax.allRules(executor);
}

// One line's rate - kept for pricing a single item, named apart from the
// order-level getSalesTax below.
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

// WHAT A TAX RULE ASKS OF A LINE. Every field is a column of products.bullion
// as getItemsFromServer composes it, so a caller passes a catalogue row
// straight in - this is not a request shape and never was one.
export type TaxableItem = {
  metal_type?: string | null;
  type?: string | null;
  purity?: number | string | null;
  gross?: number | string | null;
  domestic_tender?: boolean | null;
  legal_tender?: boolean | null;
};

// The nine values the statement took as parameters, in one place.
export function factsFrom(
  state: string | null,
  item: TaxableItem,
  item_price: number,
  item_total: number
): TaxableFacts {
  return {
    state_code: state,
    metal_category: item.metal_type ?? null,
    // products.bullion's own `type` IS the product type. The endpoint used to
    // accept a request-body `product_type` beside it, and reading only that
    // legacy name left every server-fetched item NULL here, silently falling
    // through to the 'All' rate - a real tax bug found during the products
    // conversion. There is one spelling now: the column's.
    product_type: item.type ?? null,
    price: item_price,
    purity: Number(item.purity ?? 0),
    aggregate: item_total,
    weight: Number(item.gross ?? 0),
    is_domestic: item.domestic_tender ?? null,
    is_legal_tender: item.legal_tender ?? null,
  };
}

// Rules fetched ONCE and matched in memory - replaces an implementation that
// ran the whole filter-and-rank query per item (twelve lines, twelve queries
// over the same 88 rules).
//
// GENERIC IN THE LINE, so a caller gets its own line type back with the rate
// added. THE MERGE IS A COPY and it is the one this lane left standing: the
// taxed line is pricing/ask.ts's `TaxedItem`, which calculateSalesOrderTotal,
// orders' placement and checkout all consume, so replacing it with a parallel
// rate list is a change to those callers rather than to this file. Spelled
// with Object.assign rather than a spread so the copy is visible where it is.
export async function attachSalesTaxToItems<T extends TaxableItem & PriceableLine>(
  state_code: string | null,
  items: T[],
  spots: PricingSpot[]
): Promise<(T & { sales_tax_rate: number })[]> {
  const item_total = calculateItemTotals(items, spots);
  const taxed = (item: T, sales_tax_rate: number) =>
    Object.assign({}, item, { sales_tax_rate });

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

// POST /api/tax/get_sales_tax - what a cart of catalogue lines owes in one
// state. IDS IN (D214 item 11, ruling 43): the body names an address and the
// products, and the rows behind both are read here. It used to price the
// request body itself - a caller could declare a line's purity, weight and
// legal-tender flags, which are exactly the facts a tax rule matches on, and
// so could choose the rate it was charged.
//
// The spots are the server's for the same reason: tax is a percentage of
// content * spot * premium, so a caller supplying spots would supply its own
// tax base.
export async function getSalesTax(
  { address_id, items }: GetSalesTaxBody
): Promise<number> {
  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  if (address_id && !address) throw new NotFound(`no address ${address_id}`);

  const spots = await spotsService.getSpotPrices();
  const withTax = await attachSalesTaxToItems(
    address?.state ?? null, await productService.getItemsFromServer(items), spots
  );
  return calculateSalesTax(withTax, spots);
}

// The running total a state is owed — the only write this feature makes, threaded through the caller's executor (sales-orders' create transaction) so a rolled-back order never leaves a state owing tax for it.
// State is nullable (addresses can lack one); a null state accrues nothing rather than lying about a rate — both this check and the WHERE clause below already treat 'no state' as 'no tax collected'.
export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  tx: Executor
): Promise<void> {
  if (state === null) return;
  await tax.accrue(amount, state, tx);
}
