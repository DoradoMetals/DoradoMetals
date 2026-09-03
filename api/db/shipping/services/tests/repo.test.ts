// The writes on shipping.services, against real Postgres.
//
// Self-contained: the carrier each service is created under already exists in
// dev (FedEx), read once and never written; the service rows this file
// creates are its own, named so no other suite's rows are ever touched.
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

test("update writes a real service and leaves created_by alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await services.create(
      { ...write(), id: randomUUID(), created_by: "someone", updated_by: "someone" }, c
    );

    const changed = await services.update(
      row.id, { ...write({ name: `${row.name}-renamed` }), updated_by: "an editor" }, c
    );
    assert.equal(changed, true, "update reported no row changed");

    const after = await services.getOne(row.id, c);
    assert.equal(after?.name, `${row.name}-renamed`);
    assert.equal(after?.updated_by, "an editor");
    assert.equal(after?.created_by, "someone", "an edit rewrote who created the service");
  });
});

test("update answers false for an id with no service row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await services.update(randomUUID(), { ...write(), updated_by: null }, c);
    assert.equal(changed, false, "update reported a change for a service that does not exist");
  });
});

test("remove deletes a real service and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await services.create({ ...write(), id: randomUUID(), created_by: null, updated_by: null }, c);

    const removed = await services.remove(row.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await services.getOne(row.id, c), undefined);

    const removedAgain = await services.remove(row.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a service already gone");
  });
});
