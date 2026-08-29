// The transaction history endpoint, over real HTTP.
//
// One route, and it was reading a customer's identity from the request body.
//
// `GET /api/transactions/get_transactions` is requireUser, it did
// `const { user_id } = req.body`, and the repo scopes `WHERE user_id = $1` on
// whatever it was handed. So a signed-in customer who put a body on the GET
// received somebody else's account_transactions row. Confirmed against dev
// before it was fixed - one customer read another's ledger entry, status 200,
// with their user_id, transaction_type and purchase_order_id in it.
//
// WHY IT SURVIVED THIS LONG. A GET normally carries no body, so every ordinary
// call passed undefined and got an empty response. The endpoint read as broken
// rather than as dangerous, and the frontend does not call it at all. "Returns
// nothing" and "returns anyone's ledger" were the same endpoint, distinguished
// only by whether the caller bothered to send a body.
//
// This is the customer credit ledger: production holds 17 rows across 8
// customers, $66,999.32.
//
// NOTHING IS COMMITTED. This file only reads, but it runs inside the pin like
// the rest so a future write cannot escape.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
let victim: string;
let attacker: UserFixture;
let victimRows: number;

before(async () => {
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

after(async () => {
  restoreSessions();
  await pool.end();
});

test("an anonymous caller is refused", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/transactions/get_transactions");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
  });
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
      // NOT "the response is empty". The attacker has ledger rows of their own,
      // so the correct behaviour is that they get THEIRS - the body naming
      // someone else is simply ignored. The first version of this asserted no
      // ledger row came back at all and failed against the fixed code, which
      // was the assertion being wrong rather than the fix.
      if (res.body && typeof res.body === "object") {
        assert.equal(
          res.body.user_id,
          attacker.id,
          "the response belongs to someone other than the caller"
        );
      }
    });
  });
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
  });
});

// The counterpart: the victim, asking for nothing in particular, gets their own
// row. Without this, the two tests above would pass just as well if the
// endpoint returned nothing to anybody - which is what it did before, and is
// not the same thing as being fixed.
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
  });
});

// RECORDED, NOT FIXED. The repo returns rows[0] despite the endpoint being
// called "history", so a customer with 11 ledger rows receives one. That is
// wrong and is written up in FOLLOWUPS; it is a response SHAPE, and shapes do
// not move during a schema migration. Asserted so the change is deliberate.
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
  });
});
