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

const specificity = (r: TaxRule): boolean[] => [
  r.metal_category !== "All",
  r.product_type !== "All",
  r.is_domestic !== null,
  r.is_legal_tender !== null,
  r.min_price !== 0 || r.max_price !== 1e12,
  r.purity_min !== 0 || r.purity_max !== 1,
  r.aggregate_min !== 0 || r.aggregate_max !== 1e12,
];

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
