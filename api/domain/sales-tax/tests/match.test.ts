// The matcher, against the statement it replaces — moving the rule match out of SQL is the largest behavior-preserving change in this restructure, and it decides what a customer is charged, so the old statement is carried here VERBATIM as reference and both must agree over the same facts.
// Not a test of the matcher's opinions (it has none) — just that two implementations of the same seven-way ranking pick the same rule.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import query from "#shared/db/query.ts";
import * as repo from "#db/sales-tax/repo.ts";
import { rateFor, type TaxableFacts } from "#domain/sales-tax/match.ts";

// Verbatim from features/sales-tax/repo.next.ts before the restructure.
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
    // Order from the statement, not the type — reading $7/$8/$9 off TaxableFacts in declaration order put weight into a boolean column and pg refused it.
    f.state_code, f.metal_category, f.product_type, f.price,
    f.purity, f.aggregate, f.is_domestic, f.is_legal_tender, f.weight,
  ]);
  return Number(rows[0].tax_rate);
};

const rules = await repo.allRules();

after(async () => { await pool.end(); });

test("the rules really were loaded - a matcher over nothing agrees with everything", () => {
  assert.ok(rules.length > 50, `only ${rules.length} rules loaded`);
});

// Facts drawn from the rules themselves, so every branch of the ranking is
// exercised rather than a handful of invented cases: for each rule, a set of
// facts that sits inside its own ranges.
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

// The cases the grid above cannot reach: no rule at all, and a state that has
// none. Both must be 0 rather than undefined or a throw.
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

// LIMIT 1 after a seven-way ORDER BY is only determinate if no two applicable rules tie on all seven — a property of the DATA, so a new rule creating a tie must fail here rather than silently pick a side.
test("no two rules for a state tie on every specificity axis", () => {
  // Key deliberately excludes tax_rate — two rules ranking identically with the SAME rate are harmless; what matters is identical ranking with DIFFERENT rates, which is where LIMIT 1 silently chooses.
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

// factsFrom is the seam between two item shapes — reading only the legacy product_type spelling made every server-fetched item NULL here, so a rule keyed on a product type silently fell through to its 'All' fallback (the rate was still a number, just the wrong rule's).
test("factsFrom reads the product type in both spellings, legacy first", async () => {
  const { factsFrom } = await import("#domain/sales-tax/service.ts");
  const legacy = factsFrom("TX", { metal_type: "Gold", product_type: "Coin" }, 100, 100);
  assert.equal(legacy.product_type, "Coin", "the legacy spelling stopped being read");

  const next = factsFrom("TX", { metal_type: "Gold", type: "Coin" }, 100, 100);
  assert.equal(next.product_type, "Coin", "a server-fetched item's type was dropped - D71 is back");

  // A checkout cart item's own `type` is its KIND, not a product type. When
  // both spellings are present the legacy one must win, so a legacy cart line
  // carrying type:"product" alongside product_type:"Coin" stays a Coin.
  const both = factsFrom("TX", { type: "product", product_type: "Coin" }, 100, 100);
  assert.equal(both.product_type, "Coin", "the kind discriminator outranked the real product type");
});
