// The transaction history endpoint, over real HTTP — was reading a customer's identity from the request BODY on a GET (`const { user_id } = req.body`), so a signed-in customer sending one on GET got somebody else's ledger row. Confirmed against dev before the fix: one customer read another's entry, 200, with their user_id and purchase_order_id in it.
// Survived this long because a GET normally carries no body — every ordinary call passed undefined and got an empty response, so the endpoint read as broken rather than dangerous (the frontend never calls it). This is the customer credit ledger: production holds 17 rows across 8 customers, $66,999.32.
// NOTHING IS COMMITTED — read-only, but runs inside the pin like everything else so a future write can't escape.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
let victim: string;
let attacker: UserFixture;
let victimRows: number;

beforeAll(async () => {
  // The victim is whoever has the most ledger rows, so "leaked nothing" is a
  // real assertion rather than a property of an empty table.
  const owners = await outside<{ user_id: string; n: number }>(
    `SELECT user_id, count(*)::int AS n FROM exchange.account_transactions
     GROUP BY user_id ORDER BY n DESC LIMIT 1`
  );
  assert.ok(owners[0], "dev has no account transactions - this suite proves nothing");
  victim = owners[0].user_id;
  victimRows = owners[0].n;
  assert.ok(victimRows > 0);

  const others = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users
     WHERE id <> $1 AND role IS DISTINCT FROM 'admin' LIMIT 1`,
    [victim]
  );
  attacker = others[0];
  assert.ok(attacker, "dev has no second non-admin user to attack with");
});

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
  await inPinnedTransaction(async () => {
    await as({ ...attacker, role: "user" }, async () => {
      const res = await request(app)
        .get("/api/transactions/get_transactions")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ user_id: victim }));

      assert.equal(res.status, 200);
      const body = JSON.stringify(res.body ?? "");
      assert.ok(
        !body.includes(victim),
        "the response carried the other customer's user_id - the ledger leaked"
      );
      // NOT 'the response is empty' — the attacker has their own rows, so the correct behavior is getting THEIRS; the first version asserted no row at all and failed against the fix, which was the assertion being wrong.
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
  await inPinnedTransaction(async () => {
    await as({ ...attacker, role: "user" }, async () => {
      const res = await request(app)
        .get("/api/transactions/get_transactions")
        .query({ user_id: victim });
      assert.equal(res.status, 200);
      assert.ok(
        !JSON.stringify(res.body ?? "").includes(victim),
        "the query string decided whose ledger was returned"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// The counterpart: the victim gets their own row without naming anyone — without this, the tests above would pass equally well against an endpoint that returns nothing to anybody, which is what it did before and isn't the same as fixed.
test("a customer gets their own ledger without naming anyone", async () => {
  await inPinnedTransaction(async () => {
    const users = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
      victim,
    ]);
    await as({ ...users[0], role: "user" }, async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.equal(res.status, 200);
      assert.ok(res.body, "the owner got nothing back - the endpoint is inert, not fixed");
      assert.equal(
        res.body.user_id,
        victim,
        "the owner's own read did not return the owner's row"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// Recorded, not fixed — the repo returns rows[0] despite the endpoint being called 'history', so a customer with 11 rows gets one. Wrong, written up in FOLLOWUPS, but a response SHAPE, and shapes don't move during a schema migration.
test("the response is a single row, not a history", async () => {
  await inPinnedTransaction(async () => {
    const users = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
      victim,
    ]);
    await as({ ...users[0], role: "user" }, async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.ok(
        !Array.isArray(res.body),
        "it returns an array now - if that was deliberate, this is the assertion to update"
      );
      assert.ok(victimRows > 1, "the victim has one row, so this records nothing interesting");
    });
  }, { actor: TEST_ACTOR.id });
});
