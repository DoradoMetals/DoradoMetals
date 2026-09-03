// Which sales-tax rule applies, and at what rate.
//
// THIS WAS AN ORDER BY. The implementation it replaces filtered and ranked 88
// rules in SQL, per line item, and picked the first:
//
//   ORDER BY (r.metal_category   <> 'All')   DESC,
//            (r.product_type     <> 'All')   DESC,
//            (r.is_domestic      IS NOT NULL) DESC,
//            ...
//
// Every line of that is a domain rule - "a rule naming a metal beats one saying
// All", "a rule that cares about legal tender beats one that does not" - written
// where nothing could unit-test it and where a reader had to run the query to
// learn what it meant. Same rules, same order, in a function that takes values
// and returns a number.
//
// PORTED EXACTLY, NOT IMPROVED. Every predicate and every tiebreaker below
// corresponds one-to-one with a line of that statement, including the sentinel
// comparisons (1e12, 1) that mean "this rule does not constrain price/purity".
// The differential test in tests/match.test.ts runs both implementations over
// every rule and requires identical answers; changing behaviour here is a
// separate, deliberate act.
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

// LIMIT 1 after that ORDER BY. Where two rules tie on all seven, SQL's order is
// unspecified and so is this - which is a property of the DATA, not of either
// implementation. tests/match.test.ts asserts no such tie exists in the rules
// as seeded, so the answer is determinate today and a new rule that creates one
// fails the build rather than silently picking a side.
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
