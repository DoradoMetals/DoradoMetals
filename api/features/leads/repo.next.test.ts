// Repo tests against a real database.
//
// The pricing tests cover pure functions with no I/O. These cover the layer
// that has actually broken in production - every defect that reached customers
// this month was in a repo, not in arithmetic - and they run against real
// Postgres rather than a mock, because a mock would have reproduced none of
// them: an executor in the wrong argument slot, an un-awaited query, a column
// default present in one schema and absent in another.
//
// Every test runs inside a transaction that is rolled back, so the suite leaves
// the database exactly as it found it and can run against a shared dev database
// without coordinating.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as leads from "#features/leads/repo.next.ts";
import type { PoolClient } from "pg";

let client: PoolClient;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

// Each test gets a savepoint so a failure cannot leak rows into the next one.
async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const draft = (over: Record<string, unknown> = {}) => ({
  name: "repo-test",
  phone: "555-0199",
  email: `repo-test-${crypto.randomUUID()}@example.test`,
  created_by: "test",
  updated_by: "test",
  notes: "created by repo.core.test.ts",
  ...over,
});

test("createLead returns the inserted row", async () => {
  await inRollback(async (c) => {
    const lead = await leads.createLead(draft(), c);
    assert.ok(lead.id);
    assert.equal(lead.name, "repo-test");
    assert.equal(lead.created_by, "test");
  });
});

// These two are the reason the leads move needed migration 004: the columns
// matched but the defaults did not, and only an insert that omits them shows it.
test("an omitted priority defaults to Medium", async () => {
  await inRollback(async (c) => {
    const lead = await leads.createLead(draft(), c);
    assert.equal(lead.priority, "Medium");
  });
});

test("an omitted contact takes the column default rather than null", async () => {
  await inRollback(async (c) => {
    const lead = await leads.createLead(draft(), c);
    assert.notEqual(lead.contact, null);
  });
});

test("an explicit priority is kept", async () => {
  await inRollback(async (c) => {
    const lead = await leads.createLead(draft({ priority: "High" }), c);
    assert.equal(lead.priority, "High");
  });
});

test("getLead reads back what createLead wrote", async () => {
  await inRollback(async (c) => {
    const created = await leads.createLead(draft(), c);
    const found = await leads.getLead(created.id, c);
    assert.deepEqual(found, created);
  });
});

test("getLead returns undefined for an id that does not exist", async () => {
  await inRollback(async (c) => {
    assert.equal(
      await leads.getLead("00000000-0000-0000-0000-000000000000", c),
      undefined
    );
  });
});

test("updateLead writes every field it is given and stamps updated_by", async () => {
  await inRollback(async (c) => {
    const created = await leads.createLead(draft(), c);
    const updated = await leads.updateLead(
      {
        ...created,
        name: "renamed",
        converted: true,
        contacted: true,
        responded: true,
        contact: "phone",
        notes: "edited",
        priority: "Low",
      },
      "someone-else",
      c
    );

    assert.equal(updated.name, "renamed");
    assert.equal(updated.converted, true);
    assert.equal(updated.priority, "Low");
    assert.equal(updated.updated_by, "someone-else");
    assert.equal(updated.id, created.id);
  });
});

test("deleteLead removes the row", async () => {
  await inRollback(async (c) => {
    const created = await leads.createLead(draft(), c);
    await leads.deleteLead(created.id, c);
    assert.equal(await leads.getLead(created.id, c), undefined);
  });
});

test("getAllLeads is ordered newest first", async () => {
  await inRollback(async (c) => {
    const rows = await leads.getAllLeads(c);
    const dates = rows.map((r: leads.LeadRow) => new Date(r.created_at).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  });
});

// The executor argument is what lets a repo call join its caller's transaction.
// Getting it wrong is what broke checkout, so it is asserted rather than assumed.
test("writes made with a client are invisible outside its transaction", async () => {
  const created = await (async () => {
    await client.query("BEGIN");
    const lead = await leads.createLead(draft(), client);
    // Read on the pool, outside this transaction: must not see the row.
    const outside = await leads.getLead(lead.id);
    await client.query("ROLLBACK");
    return { lead, outside };
  })();

  assert.ok(created.lead.id);
  assert.equal(created.outside, undefined);
});
