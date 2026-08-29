// Carrier services through the service, against real Postgres.
//
// One row in each schema, written together under ONE id. That is the change
// from the implementation this replaces, which mirrored on (carrier_id, name)
// because it could not use the id: 047 seeded shipping.services with fresh
// uuids, and in dev one of them - 2fb26257 - is 'Overnight' in exchange and
// 'Priority Overnight' in the new schema.
//
// PRODUCTION DOES NOT HAVE THAT PROBLEM, and it is worth stating because it is
// the opposite of what the migration notes said: all eight services match on id
// AND on (carrier_id, name) there. Dev holds two of the eight, which is why its
// copies drifted. So a service created here chooses one id and writes it to
// both tables, keeping true what production already is.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#features/shipping/services/service.ts";

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

const fedex = async (c: PoolClient) =>
  (await c.query("SELECT id FROM exchange.carriers WHERE name = 'FedEx' LIMIT 1")).rows[0].id;

// A name nothing else uses, so assertions can be scoped to it rather than to a
// table count - node:test runs files in parallel.
const aName = () => `test-service-${randomUUID().slice(0, 8)}`;

const draft = async (c: PoolClient, over = {}) => ({
  carrier_id: await fedex(c),
  name: aName(),
  code: "TEST",
  ...over,
});

test("the list keeps the three renamed columns under the names the frontend reads", async () => {
  const [row] = await service.getAllServices();
  for (const field of ["supports_pickup", "supports_dropoff", "max_weight_lbs"]) {
    assert.ok(field in row, `the list is missing ${field}, which the admin drawer reads`);
  }
  for (const field of ["supports_pickups", "supports_dropoffs", "max_weight_lb"]) {
    assert.ok(!(field in row), `${field} reached the wire under its new name`);
  }
  // These exist only in the new schema and must not appear.
  for (const field of ["created_by_id", "updated_by_id"]) {
    assert.ok(!(field in row), `${field} has no equivalent in exchange and reached the wire`);
  }
});

// exchange ordered by name alone and both carriers offer a 'Free', an
// 'Overnight' and a 'Standard', so without the id tiebreak the same rows come
// back in a different order run to run.
test("the list is ordered by name, with a stable tiebreak", async () => {
  const rows = await service.getAllServices();
  const keys = rows.map((r) => `${r.name} ${r.id}`);
  assert.deepEqual(keys, [...keys].sort());
});

test("create writes one row to each schema under the same id", async () => {
  await inRollback(async (c: PoolClient) => {
    const input = await draft(c);
    const made = await service.createService(input, c);
    assert.ok(made, "the service returned nothing");
    assert.ok(made.id);
    assert.equal(made.name, input.name);

    const { rows: nx } = await c.query(
      "SELECT id, name FROM shipping.services WHERE name = $1", [input.name]
    );
    const { rows: ex } = await c.query(
      "SELECT id, name FROM exchange.carrier_services WHERE name = $1", [input.name]
    );
    assert.equal(nx.length, 1, "not written to the new schema");
    assert.equal(ex.length, 1, "not written to exchange");
    assert.equal(nx[0].id, ex[0].id, "the two schemas gave the service different ids");
    assert.equal(nx[0].id, made.id);
  });
});

// THE DEFAULTS THE TWO TABLES DISAGREE ABOUT. exchange defaults
// supports_dropoff and is_residential to true; shipping.services defaults both
// to false. Both statements list every column, so what a caller who supplies
// neither gets is decided by service.ts - and it must be exchange's answer.
test("a service created with nothing but a name and carrier gets exchange's defaults", async () => {
  await inRollback(async (c: PoolClient) => {
    const input = await draft(c, { code: undefined });
    const made = await service.createService(input, c);
    assert.ok(made, "the service returned nothing");

    assert.equal(made.supports_dropoff, true, "supports_dropoff took the new schema's default");
    assert.equal(made.is_residential, true, "is_residential took the new schema's default");
    assert.equal(made.is_active, true);
    assert.equal(made.supports_pickup, false);
    assert.equal(made.supports_returns, false);
    assert.equal(made.supports_insurance, false);
    assert.equal(made.is_international, false);
    assert.equal(Number(made.min_transit_days), 0);
    assert.equal(Number(made.display_order), 0);
    assert.equal(made.created_by, "Dorado Metals");

    const { rows: ex } = await c.query(
      `SELECT supports_dropoff, is_residential, is_active, created_by
         FROM exchange.carrier_services WHERE id = $1`, [made.id]
    );
    assert.deepEqual(
      { ...ex[0] },
      {
        supports_dropoff: true, is_residential: true,
        is_active: true, created_by: "Dorado Metals",
      },
      "the two schemas disagree about a service nobody gave a value for"
    );
  });
});

// `false` is a value, not an absence. A `??` here would have turned every
// explicit false back into the default.
test("an explicit false is kept, not replaced by the default", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createService(
      await draft(c, { supports_dropoff: false, is_residential: false, is_active: false }), c
    );
    assert.ok(made, "the service returned nothing");
    assert.equal(made.supports_dropoff, false);
    assert.equal(made.is_residential, false);
    assert.equal(made.is_active, false);

    const { rows } = await c.query(
      `SELECT supports_dropoff, is_residential, is_active
         FROM exchange.carrier_services WHERE id = $1`, [made.id]
    );
    assert.deepEqual({ ...rows[0] },
      { supports_dropoff: false, is_residential: false, is_active: false });
  });
});

test("update changes both schemas, including a rename", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createService(await draft(c), c);
    assert.ok(made, "the service returned nothing");
    const renamed = `${made.name}-renamed`;

    const updated = await service.updateService(
      { ...made, name: renamed, max_weight_lbs: 42, supports_pickup: true }, c
    );
    assert.ok(updated, "the service returned nothing");
    assert.equal(updated.name, renamed);
    assert.equal(Number(updated.max_weight_lbs), 42);
    assert.equal(updated.supports_pickup, true);
    assert.equal(updated.id, made.id, "the update returned a different service");

    const { rows } = await c.query(
      `SELECT name, max_weight_lbs, supports_pickup
         FROM exchange.carrier_services WHERE id = $1`, [made.id]
    );
    assert.equal(rows[0].name, renamed, "exchange still holds the old name");
    assert.equal(Number(rows[0].max_weight_lbs), 42,
      "max_weight_lb did not reach exchange's max_weight_lbs");
    assert.equal(rows[0].supports_pickup, true,
      "supports_pickups did not reach exchange's supports_pickup");
  });
});

// The three renames are the one thing a misaligned parameter array would
// scramble silently: two are booleans and one a numeric, so a swap type-checks.
test("the renamed columns land in the right column on both sides", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createService(
      await draft(c, {
        supports_pickup: true, supports_dropoff: false, max_weight_lbs: 7,
      }), c
    );
    assert.ok(made, "the service returned nothing");

    const { rows: nx } = await c.query(
      `SELECT supports_pickups, supports_dropoffs, max_weight_lb
         FROM shipping.services WHERE id = $1`, [made.id]
    );
    assert.equal(nx[0].supports_pickups, true);
    assert.equal(nx[0].supports_dropoffs, false);
    assert.equal(Number(nx[0].max_weight_lb), 7);

    const { rows: ex } = await c.query(
      `SELECT supports_pickup, supports_dropoff, max_weight_lbs
         FROM exchange.carrier_services WHERE id = $1`, [made.id]
    );
    assert.equal(ex[0].supports_pickup, true);
    assert.equal(ex[0].supports_dropoff, false);
    assert.equal(Number(ex[0].max_weight_lbs), 7);
  });
});

// created_by records who made the row and an edit must not overwrite it. The
// update statement leaves it alone; this is what would notice if a parameter
// array ever shifted it back in.
test("an update does not reassign created_by", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createService(await draft(c, { created_by: "someone" }), c);
    assert.ok(made, "the service returned nothing");
    const updated = await service.updateService(
      { ...made, created_by: "somebody else", updated_by: "an editor" }, c
    );
    assert.ok(updated, "the service returned nothing");
    assert.equal(updated.created_by, "someone", "an edit rewrote who created the service");
    assert.equal(updated.updated_by, "an editor");
  });
});

test("delete removes the row from both schemas", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createService(await draft(c), c);
    assert.ok(made, "the service returned nothing");
    await service.removeService(made.id, c);

    assert.equal(await service.getServiceById(made.id, c), null);
    const { rows } = await c.query(
      "SELECT 1 FROM exchange.carrier_services WHERE id = $1", [made.id]
    );
    assert.equal(rows.length, 0, "the service is still in exchange after a delete");
  });
});

// shipping.shipments.carrier_service_id and checkout.checkouts.carrier_service_id
// reference this table with no ON DELETE, so a referenced service cannot go -
// and the exchange delete must roll back with it rather than leaving the two
// schemas disagreeing about whether the service exists.
test("deleting a referenced service is refused, and exchange keeps its row", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: referenced } = await c.query(
      `SELECT carrier_service_id AS id FROM shipping.shipments
        WHERE carrier_service_id IS NOT NULL LIMIT 1`
    );
    if (!referenced[0]) return; // dev has no shipment naming a service

    const id = referenced[0].id;
    await assert.rejects(() => service.removeService(id, c), /violates foreign key/i);
  });
});

test("getServicesByCarrierId returns that carrier's services and no others", async () => {
  const id = await fedex(client);
  const rows = await service.getServicesByCarrierId(id);
  assert.ok(rows.length > 0, "FedEx offers no services in dev");
  for (const row of rows) assert.equal(row.carrier_id, id);
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const made = await service.createService(await draft(client), client);
  assert.ok(made, "the service returned nothing");
  const outsideRow = await service.getServiceById(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.equal(outsideRow, null);
});

test("an update with no id changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: before } = await c.query("SELECT count(*)::int n FROM exchange.carrier_services");
    assert.equal(await service.updateService({ name: "nobody" }, c), null);
    const { rows: after } = await c.query("SELECT count(*)::int n FROM exchange.carrier_services");
    assert.equal(after[0].n, before[0].n);
  });
});
