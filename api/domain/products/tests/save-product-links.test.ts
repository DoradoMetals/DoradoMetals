// A product update cannot quietly lose a product: products.bullion declares
// metal_id/supplier_id/mint_id NOT NULL with a foreign key, so an id naming no
// row is refused by the database rather than silently nulled.
//
// The three reference columns travel as IDS (ruling 43): the old version sent
// NAMES and the service resolved them with an in-memory lookup. That lookup is
// gone, and the body is a PATCH - so an id is the whole message.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let product: { id: string; metal_id: string; name: string };

beforeAll(async () => {
  const { rows } = await query<typeof product>(
    "SELECT id, metal_id, name FROM products.bullion LIMIT 1"
  );
  assert.ok(rows[0], "dev has no product in products.bullion");
  product = rows[0];
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const NOBODY = "00000000-0000-0000-0000-000000000000";

const patchMetal = (metal_id: string) =>
  request(app).patch(`/api/products/${product.id}`).send({ metal_id });

test("a metal id that does not exist is refused, and nothing is written", async () => {
  // Read through a separate connection, not the pinned one: a foreign-key
  // violation aborts that transaction (Postgres 25P02), so a read-back on the
  // pinned client after the failed save cannot run at all - outside() sees
  // committed data instead.
  const [before] = await outside(
    `SELECT metal_id FROM products.bullion WHERE id = $1`, [product.id]
  );

  await inPinnedTransaction(async () => {
    await as({ ...TEST_ACTOR, role: "admin" }, async () => {
      const res = await patchMetal(NOBODY);
      assert.ok(res.status >= 400, `an unmatched metal id was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id });

  const [afterRow] = await outside(
    `SELECT metal_id FROM products.bullion WHERE id = $1`, [product.id]
  );
  assert.equal(afterRow.metal_id, before.metal_id, "the failed save changed the product");
  assert.ok(afterRow.metal_id, "the product lost its metal");
});

// The other half - without it this suite would pass against an endpoint that
// refuses EVERYTHING: secure, broken, and unusable for admins.
test("a patch naming the product's own metal id succeeds and keeps the link", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...TEST_ACTOR, role: "admin" }, async () => {
      const res = await patchMetal(product.metal_id);
      assert.equal(res.status, 200,
        `an honest patch answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT metal_id, name FROM products.bullion WHERE id = $1`, [product.id]
      );
      assert.equal(rows[0].metal_id, product.metal_id, "an honest patch lost the metal");
      assert.equal(rows[0].name, product.name);
    });
  }, { actor: TEST_ACTOR.id });
});
