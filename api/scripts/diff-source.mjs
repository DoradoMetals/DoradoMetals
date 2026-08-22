// Proves a feature's core-schema implementation is interchangeable with the
// exchange one currently serving traffic.
//
// This is the gate for flipping a feature's *_SOURCE switch. It does not test
// the new code against expectations written by hand - it runs both against real
// rows and requires identical responses. Anything the two schemas disagree
// about, including column defaults, shows up here rather than in production.
//
// Read-only: only the read paths are compared. Write paths are covered
// per-feature where the operation can be safely undone; see diff-leads.mjs.
//
//   pnpm --filter @dorado/api diff            all features
//   pnpm --filter @dorado/api diff leads      one feature
import "dotenv/config";
import pool from "#db";

// Each entry names the read operations whose output must match. Extend as
// features move.
const FEATURES = {
  leads: {
    exchange: () => import("#features/leads/repo.exchange.js"),
    next: () => import("#features/leads/repo.next.ts"),
    reads: [
      ["getAllLeads", (m) => m.getAllLeads()],
      ["getLead(first)", async (m, ctx) => (ctx.id ? m.getLead(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllLeads())[0]?.id }),
  },
  reviews: {
    exchange: () => import("#features/reviews/repo.exchange.js"),
    next: () => import("#features/reviews/repo.next.js"),
    reads: [
      ["getAllReviews", (m) => m.getAllReviews()],
      ["getPublicReviews", (m) => m.getPublicReviews()],
      ["getReview(first)", async (m, ctx) => (ctx.id ? m.getReview(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllReviews())[0]?.id }),
  },
  'sales-tax': {
    exchange: () => import("#features/sales-tax/repo.exchange.js"),
    next: () => import("#features/sales-tax/repo.next.js"),
    reads: [
      ["isNexus(TX)", (m) => m.isNexus("TX")],
      ["isNexus(CA)", (m) => m.isNexus("CA")],
      ["getSalesTax(TX, gold coin)", (m) => m.getSalesTax("TX",
        { metal_type: "Gold", product_type: "Coin", purity: 0.999, domestic_tender: true, legal_tender: true, gross: 1 }, 500, 500)],
      ["getSalesTax(CA, silver bar)", (m) => m.getSalesTax("CA",
        { metal_type: "Silver", product_type: "Bar", purity: 0.999, domestic_tender: false, legal_tender: false, gross: 10 }, 5000, 5000)],
    ],
    context: async () => ({}),
  },
  spots: {
    exchange: () => import("#features/spots/repo.exchange.js"),
    next: () => import("#features/spots/repo.next.js"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getAllMetals", (m) => m.getAllMetals()],
    ],
    context: async () => ({}),
  },
  media: {
    exchange: () => import("#features/media/repo.exchange.js"),
    next: () => import("#features/media/repo.next.js"),
    reads: [
      ["getTestImages", (m) => m.getTestImages()],
      ["getImageById(first)", async (m, ctx) => (ctx.id ? m.getImageById(ctx.id) : null)],
      ["listImagesByUser(first)", async (m, ctx) => (ctx.user ? m.listImagesByUser(ctx.user) : [])],
    ],
    context: async (m) => { const r = (await m.getTestImages())[0]; return { id: r?.id, user: r?.user_id }; },
  },
  rates: {
    exchange: () => import("#features/rates/repo.exchange.js"),
    next: () => import("#features/rates/repo.next.js"),
    reads: [
      ["getAllRates", (m) => m.getAllRates()],
      ["getAdminRates", (m) => m.getAdminRates()],
      ["getRate(first)", async (m, ctx) => (ctx.id ? m.getRate(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllRates())[0]?.id }),
  },
};

// Row order is only meaningful where the query states an ORDER BY, and both
// implementations carry the same one - so compare as-is rather than sorting,
// which would hide an ordering regression.
const norm = (v) => JSON.stringify(v);

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(FEATURES);

let pass = 0;
const failures = [];

for (const name of names) {
  const feature = FEATURES[name];
  if (!feature) {
    console.log(`  ?     ${name} is not a known feature`);
    continue;
  }

  const [ex, co] = [await feature.exchange(), await feature.next()];
  const ctx = await feature.context(ex);

  for (const [label, run] of feature.reads) {
    const [a, b] = [await run(ex, ctx), await run(co, ctx)];
    const size = Array.isArray(a) ? `${a.length} vs ${b?.length}` : "1";
    if (norm(a) === norm(b)) {
      pass++;
      console.log(`  ok    ${name}.${label}  (${size})`);
    } else {
      failures.push({ name: `${name}.${label}`, a: norm(a), b: norm(b) });
      console.log(`  FAIL  ${name}.${label}  (${size})`);
    }
  }
}

if (failures.length) {
  console.log();
  for (const f of failures) {
    console.log(`FAIL  ${f.name}`);
    console.log(`  exchange: ${f.a.slice(0, 300)}`);
    console.log(`  core:     ${f.b.slice(0, 300)}`);
  }
}

console.log();
console.log(`${pass} operation(s) identical, ${failures.length} diverge`);
if (failures.length) process.exitCode = 1;
await pool.end();
