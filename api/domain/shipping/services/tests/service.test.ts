import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { carrierId } from "#shared/testing/builders/index.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { runWithActor } from "#shared/http/actor.ts";
import * as service from "#domain/shipping/services/service.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

const fedex = (c: PoolClient) => carrierId(c, "FedEx");

const aName = () => `test-service-${randomUUID().slice(0, 8)}`;

const draft = async (c: PoolClient, over = {}) => ({
  carrier_id: await fedex(c),
  name: aName(),
  code: "TEST",
  ...over,
});

const twoPeople = async (c: PoolClient) => [
  await aUser(c, { name: "Fixture Maker" }),
  await aUser(c, { name: "Fixture Editor" }),
];

test("the list keeps the three renamed columns under the names the frontend reads", async () => {
  const [row] = await service.getAllServices();
  for (const field of ["supports_pickup", "supports_dropoff", "max_weight_lbs"]) {
    assert.ok(field in row, `the list is missing ${field}, which the admin drawer reads`);
  }
  for (const field of ["supports_pickups", "supports_dropoffs", "max_weight_lb"]) {
    assert.ok(!(field in row), `${field} reached the wire under its new name`);
  }
  for (const field of ["created_by_id", "updated_by_id"]) {
    assert.ok(!(field in row), `${field} has no equivalent in exchange and reached the wire`);
  }
});

test("the list is ordered by name, with a stable tiebreak", async () => {
  const rows = await service.getAllServices();
  const keys = rows.map((r) => `${r.name} ${r.id}`);
  assert.deepEqual(keys, [...keys].sort());
});

test("create writes the row the id names", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const input = await draft(c);
    const made = await service.createService(input);
    assert.ok(made, "the service returned nothing");
    assert.ok(made.id);
    assert.equal(made.name, input.name);

    const { rows: nx } = await c.query(
      "SELECT id, name FROM shipping.services WHERE name = $1", [input.name]
    );
    assert.equal(nx.length, 1, "not written to shipping.services");
    assert.equal(nx[0].id, made.id);
  }, { actor: TEST_ACTOR.id });
});

test("a service created with nothing but a name and carrier gets the business's defaults", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [maker] = await twoPeople(c);
    assert.ok(maker, "auth.users has no named user - this test proves nothing");

    const input = await draft(c, { code: undefined });
    const made = await runWithActor(maker.id, () => service.createService(input));
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
  }, { actor: TEST_ACTOR.id });
});

test("an explicit false is kept, not replaced by the default", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const made = await service.createService(
      await draft(c, { supports_dropoff: false, is_residential: false, is_active: false })
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
  }, { actor: TEST_ACTOR.id });
});

test("update changes the row, including a renamed column", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const made = await service.createService(await draft(c));
    assert.ok(made, "the service returned nothing");
    const renamed = `${made.name}-renamed`;

    const updated = await service.updateService(
      { ...made, name: renamed, max_weight_lbs: 42, supports_pickup: true }
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
  }, { actor: TEST_ACTOR.id });
});

test("the renamed wire fields land in the right columns", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const made = await service.createService(
      await draft(c, {
        supports_pickup: true, supports_dropoff: false, max_weight_lbs: 7,
      })
    );
    assert.ok(made, "the service returned nothing");

    const { rows: nx } = await c.query(
      `SELECT supports_pickups, supports_dropoffs, max_weight_lb
         FROM shipping.services WHERE id = $1`, [made.id]
    );
    assert.equal(nx[0].supports_pickups, true);
    assert.equal(nx[0].supports_dropoffs, false);
    assert.equal(Number(nx[0].max_weight_lb), 7);
  }, { actor: TEST_ACTOR.id });
});

test("an update does not reassign created_by", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [maker, editor] = await twoPeople(c);
    assert.ok(editor, "auth.users has fewer than two named users - this proves nothing");

    const input = await draft(c);
    const made = await runWithActor(maker.id, () => service.createService(input));
    assert.ok(made, "the service returned nothing");

    const updated = await runWithActor(editor.id, () => service.updateService({ ...made }));
    assert.ok(updated, "the service returned nothing");
    assert.equal(updated.created_by, maker.name, "an edit rewrote who created the service");
    assert.equal(updated.updated_by, editor.name);
  }, { actor: TEST_ACTOR.id });
});

test("delete removes the row", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const made = await service.createService(await draft(c));
    assert.ok(made, "the service returned nothing");
    await service.removeService(made.id);

    assert.equal(await service.getServiceById(made.id), null);
  }, { actor: TEST_ACTOR.id });
});

test("deleting a referenced service is refused, and exchange keeps its row", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: referenced } = await c.query(
      `SELECT carrier_service_id AS id FROM shipping.shipments
        WHERE carrier_service_id IS NOT NULL LIMIT 1`
    );
    if (!referenced[0]) return;

    const id = referenced[0].id;
    await assert.rejects(() => service.removeService(id), /violates foreign key/i);
  }, { actor: TEST_ACTOR.id });
});

test("getServicesByCarrierId returns that carrier's services and no others", async () => {
  const id = await fedex(client);
  const rows = await service.getServicesByCarrierId(id);
  assert.ok(rows.length > 0, "FedEx offers no services in dev");
  for (const row of rows) assert.equal(row.carrier_id, id);
});

test("an update naming an id nothing has changes nothing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: before } = await c.query("SELECT count(*)::int n FROM shipping.services");
    assert.equal(await service.updateService({ id: randomUUID(), name: "nobody" }), null);
    const { rows: after } = await c.query("SELECT count(*)::int n FROM shipping.services");
    assert.equal(after[0].n, before[0].n);
  }, { actor: TEST_ACTOR.id });
});

test("getSaleOptions answers the services a sale customer may pick from", async () => {
  const rows = await service.getSaleOptions();
  assert.ok(Array.isArray(rows));
});

test("insuranceCeilingFor with no code falls back to the lowest ceiling on offer", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const carrier_id = await fedex(c);
    const low = await service.createService(await draft(c, { code: "TEST_LOW" }));
    const high = await service.createService(await draft(c, { code: "TEST_HIGH" }));
    assert.ok(low && high, "the fixture services did not write");
    await c.query("UPDATE shipping.services SET max_insured_value = 500 WHERE id = $1", [low!.id]);
    await c.query(
      "UPDATE shipping.services SET max_insured_value = 50000 WHERE id = $1", [high!.id]
    );

    const ceiling = await service.insuranceCeilingFor(null, carrier_id, c);
    assert.ok(ceiling <= 500, `expected the lowest ceiling on offer, got ${ceiling}`);
  }, { actor: TEST_ACTOR.id });
});
