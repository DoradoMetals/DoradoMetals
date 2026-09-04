import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#pool";
import query from "#shared/db/query.ts";
import * as repo from "#db/sales-tax/repo.ts";
import { rateFor, type TaxableFacts } from "#domain/sales-tax/match.ts";

const REFERENCE = `
    SELECT COALESCE((
      SELECT r.tax_rate
      FROM tax.sales_tax_rules AS r
      WHERE r.state_code = $1
        AND r.metal_category IN ($2, 'All')
        AND r.product_type   IN ($3, 'All')
        AND $4 BETWEEN r.min_price     AND r.max_price
        AND $5 BETWEEN r.purity_min    AND r.purity_max
        AND $6 BETWEEN r.aggregate_min AND r.aggregate_max
        AND (r.is_domestic IS NULL OR r.is_domestic = $7)
        AND (r.is_legal_tender IS NULL OR r.is_legal_tender = $8)
        AND $9 BETWEEN r.weight_min AND r.weight_max
      ORDER BY
        (r.metal_category   <> 'All')   DESC,
        (r.product_type     <> 'All')   DESC,
        (r.is_domestic      IS NOT NULL) DESC,
        (r.is_legal_tender  IS NOT NULL) DESC,
        ((r.min_price  <> 0) OR (r.max_price <> 1e12)) DESC,
        ((r.purity_min <> 0) OR (r.purity_max <> 1))    DESC,
        ((r.aggregate_min <> 0) OR (r.aggregate_max <> 1e12)) DESC
      LIMIT 1
    ), 0) AS tax_rate`;

const reference = async (f: TaxableFacts): Promise<number> => {
  const { rows } = await query(REFERENCE, [
    f.state_code, f.metal_category, f.product_type, f.price,
    f.purity, f.aggregate, f.is_domestic, f.is_legal_tender, f.weight,
  ]);
  return Number(rows[0].tax_rate);
};

const rules = await repo.allRules();

afterAll(async () => { await pool.end(); });

test("the rules really were loaded - a matcher over nothing agrees with everything", () => {
  assert.ok(rules.length > 50, `only ${rules.length} rules loaded`);
});

const factsFromRule = (r: repo.TaxRule): TaxableFacts => ({
  state_code: r.state_code,
  metal_category: r.metal_category === "All" ? "Gold" : r.metal_category,
  product_type: r.product_type === "All" ? "Coin" : r.product_type,
  price: Math.min(r.min_price + 1, r.max_price),
  purity: Math.min(r.purity_min + 0.001, r.purity_max),
  aggregate: Math.min(r.aggregate_min + 1, r.aggregate_max),
  weight: Math.min(r.weight_min + 0.1, r.weight_max),
  is_domestic: r.is_domestic ?? true,
  is_legal_tender: r.is_legal_tender ?? true,
});

test("both implementations pick the same rate, for facts drawn from every rule", async () => {
  let compared = 0;
  const disagreements: string[] = [];
  for (const r of rules) {
    const f = factsFromRule(r);
    const [sqlRate, tsRate] = [await reference(f), rateFor(rules, f)];
    compared += 1;
    if (sqlRate !== tsRate) {
      disagreements.push(
        `rule ${r.id} (${r.state_code}/${r.metal_category}/${r.product_type}): SQL ${sqlRate}, TS ${tsRate}`
      );
    }
  }
  assert.equal(compared, rules.length, "not every rule was exercised");
  assert.deepEqual(disagreements, [], "the two implementations disagree");
});

test("both agree when nothing matches", async () => {
  for (const f of [
    { state_code: "ZZ", metal_category: "Gold", product_type: "Coin", price: 1,
      purity: 0.999, aggregate: 1, weight: 1, is_domestic: true, is_legal_tender: true },
    { state_code: null, metal_category: "Gold", product_type: "Coin", price: 1,
      purity: 0.999, aggregate: 1, weight: 1, is_domestic: true, is_legal_tender: true },
  ] as TaxableFacts[]) {
    assert.equal(rateFor(rules, f), await reference(f), `disagreed on ${JSON.stringify(f.state_code)}`);
  }
});

test("no two rules for a state tie on every specificity axis", () => {
  const key = (r: repo.TaxRule) => [
    r.state_code, r.metal_category !== "All", r.product_type !== "All",
    r.is_domestic !== null, r.is_legal_tender !== null,
    r.min_price !== 0 || r.max_price !== 1e12,
    r.purity_min !== 0 || r.purity_max !== 1,
    r.aggregate_min !== 0 || r.aggregate_max !== 1e12,
  ].join("|");

  const byKey = new Map<string, repo.TaxRule[]>();
  for (const r of rules) {
    const k = key(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const ambiguous = [...byKey.values()]
    .filter((group) => new Set(group.map((r) => Number(r.tax_rate))).size > 1)
    .map((group) => `${group[0].state_code}: ${group.map((r) => `${r.id.slice(0, 8)}@${r.tax_rate}`).join(" vs ")}`);

  assert.deepEqual(ambiguous, [], "rules rank identically but carry different rates - LIMIT 1 picks arbitrarily");
});

test("factsFrom reads the product type off the catalogue row's own column", async () => {
  const { factsFrom } = await import("#domain/sales-tax/service.ts");
  const row = factsFrom("TX", { metal_type: "Gold", type: "Coin" }, 100, 100);
  assert.equal(row.product_type, "Coin", "a server-fetched item's type was dropped - D71 is back");
  assert.equal(row.metal_category, "Gold");

  const untyped = factsFrom("TX", { metal_type: "Gold" }, 100, 100);
  assert.equal(untyped.product_type, null);
});
