// Is `price` on an order line DERIVED, or is it AUTHORITATIVE?
//
// Ruling 34 says the pricing API returns prices and `orders.items.price` is
// "dropped later because it's derived". The trap Jacob flagged in the same
// breath is that every pricing function reads `item.price ?? computed`, so a
// STORED price WINS - and if any row's stored price differs from what the
// calculation would produce, that row is not derived at all and dropping the
// column silently reprices a historical order.
//
// So this counts, against PRODUCTION, the rows where
//
//   price IS NOT NULL AND price <> the computed value
//
// with "computed" spelled exactly as features/purchase-orders/utils/
// calculations.ts calculateItemPrice spells it:
//
//   product: content * (bid * (premium ?? product.bid_premium ?? 0))
//   scrap:   content * (bid * (premium ?? scrap.bid_premium  ?? 0))
//
// and the bid taken from the order's OWN frozen spot (exchange.order_metals),
// which is what the accept flow prices against. Sales lines are the ask side:
//   content * (ask * (premium ?? product.ask_premium ?? 0)).
//
// IT READS exchange, NOT orders.items, and that is not a shortcut. Production
// has never been migrated - its `orders.items` is the abandoned January
// snapshot and has no `price` column at all. exchange.purchase_order_items.price
// and exchange.sales_order_items.price are where the business's real prices are.
//
// THREE BUCKETS, because "differs" is not one finding:
//   exact      - reproduces to the cent; genuinely derived.
//   rounding   - differs by less than half a cent. Arithmetic noise.
//   divergent  - differs by more. THESE ARE THE ROWS THE COLUMN PROTECTS, and
//                the report says WHY for each, because the cause decides what
//                to do about it: a value the source column can no longer hold
//                (D61's numeric(20,3) content) is not the same finding as an
//                admin having typed a different number.
//
// Read-only. Safe against production, which is the only place worth running it.
//
//   node scripts/audit-item-price.mjs           against dev
//   node scripts/audit-item-price.mjs --prod    against production
import "#env";
import pg from "pg";
import pool from "#db";

const useProd = process.argv.includes("--prod");
const db = useProd
  ? new pg.Client({
      connectionString: process.env.PROD_READONLY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : pool;
if (useProd) await db.connect();

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// exchange.scrap.content is numeric(20,3), so a stored price computed from the
// real content can only ever imply a content within half of the last digit.
// That is D61's rounding, seen from the other side, and it is what tells a
// precision artefact apart from an override.
const SCALE_HALF = 0.0005;

const PURCHASE = `
WITH line AS (
  SELECT poi.id, poi.purchase_order_id AS order_id, poi.price, poi.premium AS line_premium,
         CASE WHEN poi.scrap_id IS NOT NULL THEN 'scrap' ELSE 'product' END AS kind,
         COALESCE(s.content, pr.content) AS content,
         COALESCE(poi.premium,
                  CASE WHEN poi.scrap_id IS NOT NULL THEN s.bid_premium ELSE pr.bid_premium END,
                  0) AS premium,
         COALESCE(sm.type, pm.type) AS metal
    FROM exchange.purchase_order_items poi
    LEFT JOIN exchange.scrap s     ON s.id  = poi.scrap_id
    LEFT JOIN exchange.metals sm   ON sm.id = s.metal_id
    LEFT JOIN exchange.products pr ON pr.id = poi.product_id
    LEFT JOIN exchange.metals pm   ON pm.id = pr.metal_id
)
SELECT l.*, om.bid_spot AS spot, (l.content * (om.bid_spot * l.premium)) AS computed
  FROM line l
  LEFT JOIN exchange.order_metals om
         ON om.purchase_order_id = l.order_id AND om.type = l.metal`;

const SALES = `
SELECT soi.id, soi.sales_order_id AS order_id, soi.price, soi.premium AS line_premium,
       'bullion' AS kind, pr.content,
       COALESCE(soi.premium, pr.ask_premium, 0) AS premium,
       m.type AS metal, om.ask_spot AS spot,
       (pr.content * (om.ask_spot * COALESCE(soi.premium, pr.ask_premium, 0))) AS computed
  FROM exchange.sales_order_items soi
  LEFT JOIN exchange.products pr ON pr.id = soi.product_id
  LEFT JOIN exchange.metals m    ON m.id  = pr.metal_id
  LEFT JOIN exchange.order_metals om
         ON om.sales_order_id = soi.sales_order_id AND om.type = m.type`;

// What the stored price says the inputs must have been. Only one of the three
// can be solved for at a time, so this asks the question that has an answer:
// holding the premium and the spot, what content would produce this price - and
// is that content the stored one, rounded?
function explain(row) {
  const price = Number(row.price);
  const premium = Number(row.premium);
  const spot = Number(row.spot);
  const content = Number(row.content);

  if (spot && premium) {
    const impliedContent = price / (spot * premium);
    if (Math.abs(impliedContent - content) < SCALE_HALF) {
      return {
        cause: "source precision",
        detail: `implies content ${impliedContent.toFixed(7)} against a stored ${content}`
          + ` - inside numeric(20,3)'s half-digit, so the price is the only`
          + ` surviving record of what the customer's metal actually weighed`,
      };
    }
  }
  if (spot && content) {
    const impliedPremium = price / (spot * content);
    if (Math.abs(impliedPremium - premium) >= 1e-6) {
      return {
        cause: "premium disagrees",
        detail: `implies premium ${impliedPremium.toFixed(6)} against a stored`
          + ` ${row.line_premium ?? "null"} - the price was struck at one`
          + ` premium and the row records another`,
      };
    }
  }
  return { cause: "unexplained", detail: "neither content nor premium accounts for it" };
}

function report(label, rows) {
  const priced = rows.filter((r) => r.price !== null);
  const unpriced = rows.length - priced.length;
  const noSpot = priced.filter((r) => r.computed === null);
  const compared = priced.filter((r) => r.computed !== null);

  const exact = [];
  const rounding = [];
  const divergent = [];
  for (const r of compared) {
    const delta = Math.abs(Number(r.price) - Number(r.computed));
    if (delta === 0) exact.push(r);
    else if (delta < 0.005) rounding.push(r);
    else divergent.push({ ...r, delta, ...explain(r) });
  }

  console.log(`\n${label}`);
  console.log(`  lines                       ${rows.length}`);
  console.log(`  price IS NULL               ${unpriced}`);
  console.log(`  no frozen spot to price at  ${noSpot.length}`);
  console.log(`  compared                    ${compared.length}`);
  console.log(`    reproduce exactly         ${exact.length}`);
  console.log(`    differ under half a cent  ${rounding.length}`);
  console.log(`    DIVERGENT                 ${divergent.length}`);

  const byCause = new Map();
  for (const d of divergent) byCause.set(d.cause, (byCause.get(d.cause) ?? 0) + 1);
  for (const [cause, n] of byCause) console.log(`      ${cause.padEnd(20)} ${n}`);
  for (const d of divergent) {
    console.log(`      ${d.kind.padEnd(7)} ${String(d.metal).padEnd(9)}`
      + ` stored ${Number(d.price).toFixed(4)} vs computed ${Number(d.computed).toFixed(4)}`
      + ` (${d.delta.toFixed(4)})`);
    console.log(`        ${d.cause}: ${d.detail}`);
  }
  return divergent;
}

const where = useProd ? "PRODUCTION" : "dev";
console.log(`orders.items.price - derived or authoritative? (${where})`);

const divergent = [
  ...report("exchange.purchase_order_items", await q(PURCHASE)),
  ...report("exchange.sales_order_items", await q(SALES)),
];

console.log(`\n${"-".repeat(72)}`);
if (divergent.length === 0) {
  console.log("Every priced line reproduces from its own columns. `price` is derived,");
  console.log("and dropping it loses nothing. (Ruling 34's precondition is met.)");
} else {
  const unexplained = divergent.filter((d) => d.cause === "unexplained").length;
  console.log(`${divergent.length} priced lines DO NOT reproduce from their own columns.`);
  console.log("`price` is the only surviving record of those numbers, so dropping the");
  console.log("column reprices them. Ruling 34's precondition is NOT met.");
  if (unexplained > 0) {
    console.log(`\n${unexplained} of them are UNEXPLAINED - neither a precision artefact`);
    console.log("nor a premium disagreement. Those are the candidates for a genuine");
    console.log("admin override and want looking at one at a time.");
  }
}

// Non-zero while the column cannot be safely dropped, like audit:enum-domains:
// this is a standing answer to a question, not a gate on a commit.
if (useProd) await db.end();
else await pool.end();
process.exit(divergent.length === 0 ? 0 : 1);
