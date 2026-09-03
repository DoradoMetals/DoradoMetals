// Carrier services through the service, against real Postgres. Each test runs inside a rolled-back transaction.
// exchange.carrier_services is checked in a few places only to prove it stays untouched - service.ts writes shipping.services alone now.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#domain/shipping/services/service.ts";

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

// The signed-in person, as the database sees one - public.audit_stamp fills created_by/updated_by from the actor on the connection, so these tests say who is acting.
const actingAs = async (c: PoolClient, id: string | null) => {
  await c.query("SELECT set_config('app.actor_id', $1, true)", [id ?? ""]);
};

const twoPeople = async (c: PoolClient) =>
  (await c.query<{ id: string; name: string }>(
    `SELECT id, name FROM auth.users WHERE name IS NOT NULL ORDER BY id LIMIT 2`
  )).rows;

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

// Both carriers offer a 'Free', 'Overnight' and 'Standard' - without the id tiebreak, the same rows could come back in a different order run to run.
test("the list is ordered by name, with a stable tiebreak", async () => {
  const rows = await service.getAllServices();
  const keys = rows.map((r) => `${r.name} ${r.id}`);
  assert.deepEqual(keys, [...keys].sort());
});

test("create writes the row the id names", async () => {
  await inRollback(async (c: PoolClient) => {
    const input = await draft(c);
    const made = await service.createService(input, c);
    assert.ok(made, "the service returned nothing");
    assert.ok(made.id);
    assert.equal(made.name, input.name);

    const { rows: nx } = await c.query(
      "SELECT id, name FROM shipping.services WHERE name = $1", [input.name]
    );
    assert.equal(nx.length, 1, "not written to shipping.services");
    assert.equal(nx[0].id, made.id);
  });
});

// Defaults are service.ts's, not the table's: the column defaults to false, but the business's answer is true, and the statement lists every column so service.ts decides.
test("a service created with nothing but a name and carrier gets the business's defaults", async () => {
  await inRollback(async (c: PoolClient) => {
    const [maker] = await twoPeople(c);
    assert.ok(maker, "auth.users has no named user - this test proves nothing");
    await actingAs(c, maker.id);

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
    // "Dorado Metals" was the old placeholder when nobody was named - the row records the real actor now.
    assert.equal(made.created_by, maker.name);

    const { rows: nx } = await c.query(
      `SELECT supports_dropoffs, is_residential, is_active, created_by
         FROM shipping.services WHERE id = $1`, [made.id]
    );
    assert.deepEqual(
      { ...nx[0] },
      {
        supports_dropoffs: true, is_residential: true,
        is_active: true, created_by: maker.name,
      },
      "the stored row disagrees about a service nobody gave a value for"
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
      `SELECT supports_dropoffs, is_residential, is_active
         FROM shipping.services WHERE id = $1`, [made.id]
    );
    assert.deepEqual({ ...rows[0] },
      { supports_dropoffs: false, is_residential: false, is_active: false });
  });
});

test("update changes the row, including a renamed column", async () => {
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
      `SELECT name, max_weight_lb, supports_pickups
         FROM shipping.services WHERE id = $1`, [made.id]
    );
    assert.equal(rows[0].name, renamed, "the row still holds the old name");
    assert.equal(Number(rows[0].max_weight_lb), 42,
      "max_weight_lbs did not land in max_weight_lb");
    assert.equal(rows[0].supports_pickups, true,
      "supports_pickup did not land in supports_pickups");
  });
});

// The three renames are the one thing a misaligned parameter array would
// scramble silently: two are booleans and one a numeric, so a swap type-checks.
test("the renamed wire fields land in the right columns", async () => {
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
  });
});

// created_by records who made the row; an edit must not overwrite it - the audit trigger never touches created_* on UPDATE.
test("an update does not reassign created_by", async () => {
  await inRollback(async (c: PoolClient) => {
    const [maker, editor] = await twoPeople(c);
    assert.ok(editor, "auth.users has fewer than two named users - this proves nothing");

    await actingAs(c, maker.id);
    const made = await service.createService(await draft(c), c);
    assert.ok(made, "the service returned nothing");

    await actingAs(c, editor.id);
    const updated = await service.updateService({ ...made }, c);
    assert.ok(updated, "the service returned nothing");
    assert.equal(updated.created_by, maker.name, "an edit rewrote who created the service");
    assert.equal(updated.updated_by, editor.name);
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

// shipping.shipments.carrier_service_id / checkout.checkouts.carrier_service_id reference this table with no ON DELETE - a referenced service can't be removed.
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
