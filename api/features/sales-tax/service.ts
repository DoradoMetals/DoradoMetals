// Sales tax: nexus, the rule match, and the running total.
//
// THE MATCH MOVED OUT OF SQL. See match.ts. The repo reads 88 rules whole and
// the ranking happens in TypeScript, where it can be tested without a database -
// which matters more here than anywhere else in the API, because this decides
// what a customer is charged.
//
// COLLECTING_NEXUS_TAXES is false in production (confirmed by Jacob), which
// means the early return below never fires and the rules are consulted for
// every state. Preserved exactly rather than simplified: turning the flag on is
// a business decision and the branch has to still be there when it happens.
import * as tax from "#features/sales-tax/repo.ts";
import * as legacy from "#features/sales-tax/legacy.repo.ts";
import { rateFor, type TaxableFacts } from "#features/sales-tax/match.ts";
import withTransaction from "#shared/db/withTransaction.js";
import type { Executor, TaxRule } from "#features/sales-tax/repo.ts";
import * as spotsService from "#features/spots/service.ts";
import {
  calculateSalesTax,
  calculateItemTotals,
  calculateItemAsk,
} from "#features/sales-orders/utils/calculations.ts";
import type { SpotPriceWire } from "@dorado/contracts";

export async function isNexus(state: string, executor?: Executor): Promise<boolean> {
  return await tax.reachedNexus(state, executor);
}

// The rules, read once. A caller pricing a whole order should fetch them once
// and pass them to rateFor per line rather than calling getSalesTax per line -
// which is what the SQL implementation forced, one query per item.
export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  return await tax.allRules(executor);
}

// One line's rate. The repo used to expose this shape and callers used it
// directly; it is kept because pricing a single item is a real need, but it is
// named for what it does rather than colliding with the order-level
// getSalesTax below.
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
    // BOTH SPELLINGS, DELIBERATELY. Items reach this from two directions: the
    // get_sales_tax endpoint hands over req.body, where the frontend still
    // spells it product_type - and the order-create paths hand over
    // getItemsFromServer's rows, which carry products.bullion's own name,
    // `type`. Reading only the legacy spelling made every server-fetched item
    // NULL here, so rules keyed on a product type silently fell through to
    // their 'All' fallback - a tax-rate bug, found during the products
    // conversion (D71). Legacy first: a cart item's own `type` is its
    // kind discriminator ("product"/"scrap"), never a product type.
    product_type: (item.product_type as string) ?? (item.type as string) ?? null,
    price: item_price,
    purity: Number(item.purity ?? 0),
    aggregate: item_total,
    weight: Number(item.gross ?? 0),
    is_domestic: (item.domestic_tender as boolean) ?? null,
    is_legal_tender: (item.legal_tender as boolean) ?? null,
  };
}

// EVERY LINE, WITH THE RULES READ ONCE.
//
// The implementation this replaces ran the whole filter-and-rank statement per
// item - `items.map(async item => taxRepo.getSalesTax(...))` - so an order with
// twelve lines issued twelve copies of a query over the same 88 rules. Here the
// rules are fetched once and matched in memory, which is the N+1 the per-table
// design is usually accused of creating, going the other way.
export async function attachSalesTaxToItems(
  state_code: string | null,
  items: Record<string, unknown>[],
  spots: SpotPriceWire[]
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

// `spots` IS IGNORED IF THE CALLER SENDS IT. The tax on a line is a percentage
// of what the line is worth, and what it is worth is content * spot * premium -
// so a caller supplying its own spots was supplying its own tax base. The
// server's spots are the only ones used, and the type enforces it.
export async function getSalesTax({
  address,
  items,
}: {
  address: { state: string };
  items: Record<string, unknown>[];
}): Promise<number> {
  const spots = await spotsService.getPricingSpots();
  const withTax = await attachSalesTaxToItems(address.state, items, spots);
  return calculateSalesTax(withTax as never, spots as never);
}

// The running total a state is owed. Written to BOTH schemas, in one
// transaction - this is the only write the feature has.
// TAKES THE CALLER'S EXECUTOR. sales-orders/service.ts calls this from inside
// the transaction that creates the order, so the accrual has to join it - an
// order that rolls back must not leave a state owing tax for it. Opening a new
// transaction here would have committed the accrual independently.
// STATE IS NULLABLE, because addresses are - production sales order 1f3e9efe
// has an address with no state. A null state accrues nothing: both statements
// key on `WHERE state = $2` and match no row, which is the behaviour that
// already existed. Typed honestly rather than making the caller pass a lie.
export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  executor?: Executor
): Promise<void> {
  if (state === null) return;
  const write = async (c: Executor) => {
    await legacy.accrue(amount, state, c);
    await tax.accrue(amount, state, c);
  };
  return executor ? write(executor) : withTransaction(write);
}
