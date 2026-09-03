// Which sales-tax rule applies, and at what rate — ported EXACTLY from an ORDER BY that filtered and ranked 88 rules in SQL per line item (same rules, same order, now testable without a database).
// Every predicate and tiebreaker below corresponds one-to-one with a line of that statement, sentinel comparisons (1e12, 1 meaning 'this rule doesn't constrain price/purity') included. tests/match.test.ts differentially checks both implementations agree on every rule — changing behavior here is a separate, deliberate act.
import type { TaxRule } from "#db/sales-tax/repo.ts";

export type TaxableFacts = {
  state_code: string | null;
  metal_category: string | null;
  product_type: string | null;
  price: number;
  purity: number;
  aggregate: number;
  weight: number;
  is_domestic: boolean | null;
  is_legal_tender: boolean | null;
};

const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

// SQL's `x IN ($n, 'All')` with a null $n matches only 'All' - NULL = anything
// is unknown, never true. Reproduced rather than relied on.
const matchesCategory = (ruleValue: string, given: string | null) =>
  ruleValue === "All" || (given !== null && ruleValue === given);

export function applicable(rules: TaxRule[], f: TaxableFacts): TaxRule[] {
  if (f.state_code === null) return [];
  return rules.filter(
    (r) =>
      r.state_code === f.state_code &&
      matchesCategory(r.metal_category, f.metal_category) &&
      matchesCategory(r.product_type, f.product_type) &&
      between(f.price, r.min_price, r.max_price) &&
      between(f.purity, r.purity_min, r.purity_max) &&
      between(f.aggregate, r.aggregate_min, r.aggregate_max) &&
      between(f.weight, r.weight_min, r.weight_max) &&
      (r.is_domestic === null || r.is_domestic === f.is_domestic) &&
      (r.is_legal_tender === null || r.is_legal_tender === f.is_legal_tender)
  );
}

// The seven tiebreakers, in the statement's order. Each is "is this rule more
// specific on this axis", and SQL sorted them DESC - true first.
const specificity = (r: TaxRule): boolean[] => [
  r.metal_category !== "All",
  r.product_type !== "All",
  r.is_domestic !== null,
  r.is_legal_tender !== null,
  r.min_price !== 0 || r.max_price !== 1e12,
  r.purity_min !== 0 || r.purity_max !== 1,
  r.aggregate_min !== 0 || r.aggregate_max !== 1e12,
];

// A tie on all seven axes is unspecified — a property of the DATA, not either implementation. match.test.ts asserts no such tie exists in the seeded rules, so a new rule creating one fails the build rather than silently picking a side.
export function rateFor(rules: TaxRule[], f: TaxableFacts): number {
  const candidates = applicable(rules, f);
  if (candidates.length === 0) return 0;

  let best = candidates[0];
  let bestKey = specificity(best);
  for (const r of candidates.slice(1)) {
    const key = specificity(r);
    for (let i = 0; i < key.length; i++) {
      if (key[i] === bestKey[i]) continue;
      if (key[i]) { best = r; bestKey = key; }
      break;
    }
  }
  return Number(best.tax_rate);
}
