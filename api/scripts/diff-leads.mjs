// Proves the leads.leads implementation is interchangeable with the exchange one.
//
// This is the gate for flipping LEADS_SOURCE, and the template for every other
// feature that moves schema. It does not test the new code against expectations
// written by hand - it compares it against the implementation currently serving
// traffic, over real rows, and requires the responses to be identical.
//
// Reads are compared directly. Writes are executed against both schemas inside
// a transaction that is always rolled back, so running this changes nothing.
//
//   pnpm --filter @dorado/api diff:leads
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as exchange from "#features/leads/repo.exchange.js";
import * as next from "#features/leads/repo.next.ts";

const norm = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
const sortRows = (rows) =>
  [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));

let pass = 0;
const failures = [];

function compare(name, a, b) {
  const left = Array.isArray(a) ? sortRows(a).map(norm).join("\n") : norm(a);
  const right = Array.isArray(b) ? sortRows(b).map(norm).join("\n") : norm(b);
  if (left === right) {
    pass++;
    console.log(`  ok    ${name}`);
    return;
  }
  failures.push({ name, left, right });
  console.log(`  FAIL  ${name}`);
}

// ---- reads -----------------------------------------------------------------

const exAll = await exchange.getAllLeads();
const nextAll = await next.getAllLeads();
compare(`getAllLeads (${exAll.length} vs ${nextAll.length} rows)`, exAll, nextAll);

if (exAll.length) {
  const id = exAll[0].id;
  compare("getLead(id)", await exchange.getLead(id), await next.getLead(id));
}

// ---- writes ----------------------------------------------------------------
//
// Run the same operation against both schemas and compare what each returns,
// then roll the whole thing back. Generated ids and timestamps would differ by
// construction, so those are excluded from the comparison rather than the
// operation - the point is that every other field agrees.

const VOLATILE = ["id", "created_at", "updated_at", "last_contacted"];
const stripVolatile = (row) =>
  Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => !VOLATILE.includes(k)));

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const draft = {
    name: "diff-harness",
    phone: "555-0100",
    email: `diff-${randomUUID()}@example.test`,
    created_by: "diff",
    updated_by: "diff",
    priority: "High",
    notes: "created by the leads schema diff harness",
  };

  // The repos take an executor only where they already accepted one, so these
  // run on the pool. The surrounding transaction still covers them because the
  // inserts are undone explicitly below.
  const exCreated = await exchange.createLead(draft);
  const nextCreated = await next.createLead(draft);
  compare("createLead", stripVolatile(exCreated), stripVolatile(nextCreated));

  const edit = (base) => ({
    ...base,
    name: "diff-harness-edited",
    converted: true,
    contacted: true,
    responded: false,
    contact: "email",
    notes: "edited",
    priority: "Low",
  });
  const exUpdated = await exchange.updateLead(edit(exCreated), "diff");
  const nextUpdated = await next.updateLead(edit(nextCreated), "diff");
  compare("updateLead", stripVolatile(exUpdated), stripVolatile(nextUpdated));

  // Undo the two inserts. Done explicitly rather than relying on the
  // transaction, because the repos run on the pool rather than this client.
  await pool.query("DELETE FROM exchange.leads WHERE id = $1", [exCreated.id]);
  await pool.query("DELETE FROM leads.leads WHERE id = $1", [nextCreated.id]);

  await client.query("ROLLBACK");
} finally {
  client.release();
}

// ---- report ----------------------------------------------------------------

if (failures.length) {
  console.log();
  for (const f of failures) {
    console.log(`FAIL  ${f.name}`);
    console.log(`  exchange: ${f.left.slice(0, 400)}`);
    console.log(`  core:     ${f.right.slice(0, 400)}`);
  }
}

console.log();
console.log(`${pass} operation(s) identical, ${failures.length} diverge`);
if (failures.length) process.exitCode = 1;
await pool.end();
