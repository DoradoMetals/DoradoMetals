// The ciphertext columns 104 added, exercised against real Postgres.
//
// shared/crypto/tests/envelope.test.ts proves the CIPHER. This proves the
// column: that a sealed value survives a round trip through `text`, that the
// AAD really is bound to the row id Postgres assigned rather than one invented
// in JavaScript, and that the key id written beside it is the one that can find
// the row again.
//
// EVERY VALUE HERE IS SYNTHETIC. Dev holds sixteen payouts and not one bank
// number - all sixteen are ECHECK or DORADO_ACCOUNT - so there is nothing real
// to reach for even by accident, and these rows are rolled back regardless.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { parseKey, seal, open, aadFor, isEnvelope, keyIdOf } from "#shared/crypto/envelope.ts";
import { randomBytes } from "node:crypto";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
afterAll(async () => { client.release(); await pool.end(); });

// LOCKS.ORDERS, AND THERE IS NO `PAYMENTS` LOCK ON PURPOSE. This file writes
// payments.details and nothing else, so a lock of its own looks right - but
// `features/payments/details/tests/repo.test.ts` ALSO writes payments.details
// and takes ORDERS (it writes orders.transactions too, since 099 put the payout
// link there). Two files writing one table under two different locks is exactly
// the deadlock shared/testing/locks.ts exists to prevent: neither would wait for
// the other, and both would pass in isolation. The lock follows the TABLE, not
// the feature name.
const inRollback = async (fn: (c: PoolClient) => Promise<void>) => {
  await client.query("BEGIN");
  await takeLocks(client, [LOCKS.ORDERS]);
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
};

const KEY = parseKey("test1", randomBytes(32).toString("base64"));

// Synthetic, and deliberately shaped like the real thing so that a projection
// which leaked one would be recognisable in a diff.
const ROUTING = "021000021";
const ACCOUNT = "000123456789";

const aDetailRow = async (c: PoolClient): Promise<string> => {
  const { rows: users } = await c.query("SELECT id FROM auth.users LIMIT 1");
  assert.ok(users.length, "dev has no users, so this test would assert nothing");
  const { rows } = await c.query(
    `INSERT INTO payments.details (user_id, account_holder, bank_name, account_type)
     VALUES ($1, 'A Test Customer', 'Test Bank', 'CHECKING')
     RETURNING id`,
    [users[0].id]
  );
  return rows[0].id as string;
};

test("a sealed routing number round-trips through the column", async () => {
  await inRollback(async (c) => {
    const id = await aDetailRow(c);
    const sealed = seal(ROUTING, KEY, aadFor(id, "routing_number"));

    await c.query(
      `UPDATE payments.details
          SET routing_number_encrypted = $2, encryption_key_id = $3
        WHERE id = $1`,
      [id, sealed, KEY.id]
    );

    const { rows } = await c.query(
      `SELECT routing_number_encrypted, encryption_key_id
         FROM payments.details WHERE id = $1`, [id]
    );
    assert.equal(rows.length, 1);
    assert.ok(isEnvelope(rows[0].routing_number_encrypted), "column did not hold an envelope");
    assert.equal(rows[0].encryption_key_id, KEY.id);
    assert.equal(keyIdOf(rows[0].routing_number_encrypted), KEY.id);

    // The value survives the text column byte for byte.
    assert.equal(open(rows[0].routing_number_encrypted, KEY, aadFor(id, "routing_number")), ROUTING);
  });
});

test("the stored ciphertext does not contain the plaintext", async () => {
  await inRollback(async (c) => {
    const id = await aDetailRow(c);
    await c.query(
      `UPDATE payments.details SET account_number_encrypted = $2 WHERE id = $1`,
      [id, seal(ACCOUNT, KEY, aadFor(id, "account_number"))]
    );
    // Asked of POSTGRES, not of the JavaScript string - a LIKE against the
    // stored value is what an attacker with a database dump actually has.
    const { rows } = await c.query(
      `SELECT account_number_encrypted LIKE '%' || $2 || '%' AS leaks
         FROM payments.details WHERE id = $1`, [id, ACCOUNT]
    );
    assert.equal(rows[0].leaks, false, "the stored ciphertext contains the plaintext");
  });
});

test("the AAD binds to the row id Postgres assigned, not one we chose", async () => {
  await inRollback(async (c) => {
    const a = await aDetailRow(c);
    const b = await aDetailRow(c);
    assert.notEqual(a, b);

    const sealedForA = seal(ACCOUNT, KEY, aadFor(a, "account_number"));

    // Moving A's ciphertext onto B's row is exactly the copy-paste an operator
    // might make during a botched rotation. It must not decrypt.
    await c.query(
      `UPDATE payments.details SET account_number_encrypted = $2 WHERE id = $1`,
      [b, sealedForA]
    );
    const { rows } = await c.query(
      `SELECT account_number_encrypted FROM payments.details WHERE id = $1`, [b]
    );
    assert.throws(
      () => open(rows[0].account_number_encrypted, KEY, aadFor(b, "account_number")),
      /authentication failed/,
      "a ciphertext moved between rows decrypted anyway - the AAD is not bound"
    );
  });
});

test("encryption_key_id finds the rows a rotation would have to touch", async () => {
  await inRollback(async (c) => {
    const id = await aDetailRow(c);
    await c.query(
      `UPDATE payments.details
          SET routing_number_encrypted = $2, encryption_key_id = 'oldkey'
        WHERE id = $1`,
      [id, seal(ROUTING, KEY, aadFor(id, "routing_number"))]
    );
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM payments.details WHERE encryption_key_id = 'oldkey'`
    );
    assert.equal(rows[0].n, 1, "the rotation predicate found nothing");
  });
});

// The join the script depends on. 073 established that a details row KEEPS its
// payout's id; if that ever stops being true the script silently processes zero
// rows, which is the failure mode its --allow-empty refusal exists to catch.
// KEPT (exchange-fixtures lane, D214 item 10): this is a migration-fidelity
// check on real backfilled data, not a fixture - a builder-made details row
// has no exchange.payouts counterpart to join, so it cannot prove the thing
// encrypt-payout-details.ts actually depends on.
test("payments.details still joins exchange.payouts on id", async () => {
  const { rows } = await client.query(
    `SELECT count(*)::int n
       FROM payments.details d JOIN exchange.payouts p ON p.id = d.id`
  );
  assert.ok(
    rows[0].n > 0,
    "no details row shares an id with a payout - 073's id-keeping has broken, " +
    "and encrypt-payout-details.ts would find nothing to seal"
  );
});
