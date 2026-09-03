// Writes on shipping.services, against real Postgres. Self-contained: the carrier used already exists (seeded FedEx), read-only; the service rows here are its own.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as services from "#db/shipping/services/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aName = () => `test-repo-service-${randomUUID().slice(0, 8)}`;

const write = (over: Partial<services.ServiceWrite> = {}): services.ServiceWrite => ({
  carrier_id: null,
  name: aName(),
  description: null,
  code: null,
  provider_code: null,
  supports_pickups: false,
  supports_dropoffs: true,
  supports_returns: false,
  supports_insurance: false,
  is_international: false,
  is_residential: true,
  is_active: true,
  max_weight_lb: null,
  max_length_in: null,
  max_width_in: null,
  max_height_in: null,
  max_declared_value: null,
  min_transit_days: 0,
  max_transit_days: 0,
  display_order: 0,
  ...over,
});

// Author fields aren't arguments any more - audit_stamp records them from the actor now; this checks an edit never rewrites the creator.
const actingAs = async (c: PoolClient, id: string | null) => {
  await c.query("SELECT set_config('app.actor_id', $1, true)", [id ?? ""]);
};

const twoPeople = async (c: PoolClient) =>
  (await c.query<{ id: string; name: string }>(
    `SELECT id, name FROM auth.users WHERE name IS NOT NULL ORDER BY id LIMIT 2`
  )).rows;

test("update writes a real service and leaves created_by alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const [maker, editor] = await twoPeople(c);
    assert.ok(editor, "auth.users has fewer than two named users - this proves nothing");

    await actingAs(c, maker.id);
    const row = await services.create({ ...write(), id: randomUUID() }, c);

    await actingAs(c, editor.id);
    const changed = await services.update(
      row.id, write({ name: `${row.name}-renamed` }), c
    );
    assert.equal(changed, true, "update reported no row changed");

    const after = await services.getOne(row.id, c);
    assert.equal(after?.name, `${row.name}-renamed`);
    assert.equal(after?.updated_by, editor.name);
    assert.equal(after?.created_by, maker.name, "an edit rewrote who created the service");
  });
});

test("update answers false for an id with no service row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await services.update(randomUUID(), write(), c);
    assert.equal(changed, false, "update reported a change for a service that does not exist");
  });
});

test("remove deletes a real service and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await services.create({ ...write(), id: randomUUID() }, c);

    const removed = await services.remove(row.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await services.getOne(row.id, c), undefined);

    const removedAgain = await services.remove(row.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a service already gone");
  });
});
