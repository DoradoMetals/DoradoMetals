// The transaction history endpoint, over real HTTP — was reading a customer's identity from the request BODY on a GET (`const { user_id } = req.body`), so a signed-in customer sending one on GET got somebody else's ledger row. Confirmed against dev before the fix: one customer read another's entry, 200, with their user_id and purchase_order_id in it.
// Survived this long because a GET normally carries no body — every ordinary call passed undefined and got an empty response, so the endpoint read as broken rather than dangerous (the frontend never calls it). This is the customer credit ledger: production holds 17 rows across 8 customers, $66,999.32 - in exchange.account_transactions, which is FROZEN (D212). The live table is payments.ledger, and the fixture below is BUILT there rather than discovered from exchange (exchange-fixtures lane, D214 item 10) - domain/transactions reads and writes payments.ledger exclusively now.
// NOTHING IS COMMITTED — read-only, but runs inside the pin like everything else so a future write can't escape.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, aLedgerEntry } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

// Two customers, each with their own payments.ledger rows, built fresh inside
// each pinned transaction. The victim gets TWO rows so "the response is a
// single row, not a history" records something real - a victim discovered
// with one row proved nothing, which the original fixture had to guard
// against explicitly; a built one just always has two.
async function aVictimAndAttacker(c: PoolClient) {
  const victim = await aUser(c, { name: "Ledger Victim" });
  const attacker = await aUser(c, { name: "Ledger Attacker" });
  await aLedgerEntry(c, victim, { amount: 100 });
  await aLedgerEntry(c, victim, { amount: 50 });
  await aLedgerEntry(c, attacker, { amount: 25 });
  return {
    victim: { ...victim, role: "user" as const },
    attacker: { ...attacker, role: "user" as const },
  };
}

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("an anonymous caller is refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });
});

// THE ASSERTION THIS FILE EXISTS FOR. Sent exactly the way the exploit was:
// a JSON body on a GET, naming somebody else.
test("a body naming another customer does not return their ledger", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim, attacker } = await aVictimAndAttacker(c);
    await as(attacker, async () => {
      const res = await request(app)
        .get("/api/transactions/get_transactions")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ user_id: victim.id }));

      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body ?? "");
      assert.ok(
        !body.includes(victim.id),
        "the response carried the other customer's user_id - the ledger leaked"
      );
      // NOT 'the response is empty' — the attacker has their own row, so the correct behavior is getting THEIRS; the first version asserted no row at all and failed against the fix, which was the assertion being wrong.
      if (res.body && typeof res.body === "object") {
        assert.equal(
          res.body.user_id,
          attacker.id,
          "the response belongs to someone other than the caller"
        );
      }
    });
  }, { actor: TEST_ACTOR.id });
});

// The same claim in the query string, in case the read ever moves to req.query
// as a "fix". It must be ignored the same way.
test("a query parameter naming another customer is ignored too", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim, attacker } = await aVictimAndAttacker(c);
    await as(attacker, async () => {
      const res = await request(app)
        .get("/api/transactions/get_transactions")
        .query({ user_id: victim.id });
      assert.equal(res.status, 200);
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(victim.id),
        "the query string decided whose ledger was returned"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// The counterpart: the victim gets their own row without naming anyone — without this, the tests above would pass equally well against an endpoint that returns nothing to anybody, which is what it did before and isn't the same as fixed.
test("a customer gets their own ledger without naming anyone", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim } = await aVictimAndAttacker(c);
    await as(victim, async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.equal(res.status, 200);
      assert.ok(res.body, "the owner got nothing back - the endpoint is inert, not fixed");
      assert.equal(
        res.body.user_id,
        victim.id,
        "the owner's own read did not return the owner's row"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// Recorded, not fixed — the repo returns rows[0] despite the endpoint being called 'history', so a customer with 2 rows gets one. Wrong, written up in FOLLOWUPS, but a response SHAPE, and shapes don't move during a schema migration.
test("the response is a single row, not a history", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim } = await aVictimAndAttacker(c);
    await as(victim, async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.ok(
        !Array.isArray(res.body),
        "it returns an array now - if that was deliberate, this is the assertion to update"
      );
    });
  }, { actor: TEST_ACTOR.id });
});
