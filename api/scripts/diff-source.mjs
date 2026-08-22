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
    core: () => import("#features/leads/repo.core.ts"),
    reads: [
      ["getAllLeads", (m) => m.getAllLeads()],
      ["getLead(first)", async (m, ctx) => (ctx.id ? m.getLead(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllLeads())[0]?.id }),
  },
  rates: {
    exchange: () => import("#features/rates/repo.exchange.js"),
    core: () => import("#features/rates/repo.core.js"),
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

  const [ex, co] = [await feature.exchange(), await feature.core()];
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
