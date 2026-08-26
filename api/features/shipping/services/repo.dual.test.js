// Dual-write tests for carrier services, against real Postgres.
//
// The property under test is not "the row copied". The two tables deliberately
// disagree about ids - 047 seeds shipping.services from a dev snapshot and
// production's exchange rows carry different ones - so what has to hold is that
// (carrier_id, name) resolves to exactly one row on each side and that writes
// find it.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as dual from "#features/shipping/services/repo.dual.js";
import * as next from "#features/shipping/services/repo.next.ts";
import * as exchange from "#features/shipping/services/repo.exchange.js";

let client;

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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const fedex = async (c) =>
  (await c.query("SELECT id FROM exchange.carriers WHERE name = 'FedEx' LIMIT 1")).rows[0].id;

// A name nothing else uses, so assertions can be scoped to it rather than to a
// table count - other test files commit fixtures and node:test runs in parallel.
const aName = () => `test-service-${randomUUID().slice(0, 8)}`;

test("a new service is mirrored under its (carrier_id, name) pair", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();

    const created = await dual.create({ carrier_id, name }, c);

    const { rows } = await c.query(
      "SELECT id, name FROM shipping.services WHERE carrier_id = $1 AND name = $2",
      [carrier_id, name]
    );
    assert.equal(rows.length, 1, "the service was not mirrored");
    assert.equal(rows[0].name, created.name);
  });
});

// The reason the mirror cannot key on id. In dev, exchange's FedEx 'Overnight'
// carries the id that shipping.services gives FedEx 'Priority Overnight'; an
// insert carrying exchange's id would violate the primary key and take the
// caller's transaction with it.
test("mirroring a service whose exchange id belongs to a different service here still works", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();

    // Give the new-schema table a row that already owns the id exchange is
    // about to use, under a different name.
    const stolen = randomUUID();
    await c.query(
      "INSERT INTO shipping.services (id, carrier_id, name) VALUES ($1, $2, $3)",
      [stolen, carrier_id, aName()]
    );
    const { rows: [ex] } = await c.query(
      "INSERT INTO exchange.carrier_services (id, carrier_id, name) VALUES ($1, $2, $3) RETURNING id",
      [stolen, carrier_id, name]
    );

    await next.mirrorService(ex.id, c);

    const { rows } = await c.query(
      "SELECT id FROM shipping.services WHERE carrier_id = $1 AND name = $2",
      [carrier_id, name]
    );
    assert.equal(rows.length, 1, "the mirror did not write a row for the new name");
    assert.notEqual(rows[0].id, stolen, "the mirror overwrote the unrelated service");
  });
});

test("renaming a service moves the mirrored row rather than adding a second", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const before = aName();
    const after = aName();

    const created = await dual.create({ carrier_id, name: before }, c);
    await dual.update({ ...created, name: after, code: null }, c);

    const { rows: old } = await c.query(
      "SELECT 1 FROM shipping.services WHERE carrier_id = $1 AND name = $2", [carrier_id, before]
    );
    const { rows: renamed } = await c.query(
      "SELECT 1 FROM shipping.services WHERE carrier_id = $1 AND name = $2", [carrier_id, after]
    );
    assert.equal(old.length, 0, "the pre-rename row was left behind");
    assert.equal(renamed.length, 1, "the renamed row is missing");
  });
});

test("deleting a service removes it from both schemas", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();
    const created = await dual.create({ carrier_id, name }, c);

    await dual.remove(created.id, c);

    const { rows: ex } = await c.query(
      "SELECT 1 FROM exchange.carrier_services WHERE id = $1", [created.id]
    );
    const { rows: nx } = await c.query(
      "SELECT 1 FROM shipping.services WHERE carrier_id = $1 AND name = $2", [carrier_id, name]
    );
    assert.equal(ex.length, 0, "the exchange row survived");
    assert.equal(nx.length, 0, "the mirrored row survived");
  });
});

// 053. Proving the index can actually refuse, not just that it exists - an
// index nobody has seen fail is an assumption.
test("shipping.services refuses a duplicate (carrier_id, name)", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();
    await c.query("INSERT INTO shipping.services (carrier_id, name) VALUES ($1, $2)", [carrier_id, name]);

    await assert.rejects(
      () => c.query("INSERT INTO shipping.services (carrier_id, name) VALUES ($1, $2)", [carrier_id, name]),
      (err) => err.code === "23505",
      "a duplicate (carrier_id, name) was accepted"
    );
  });
});

// The wire shape must not change: three columns were renamed in the new layout
// and the frontend reads the old names.
test("the new-schema read returns the exchange column names", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();
    await dual.create({ carrier_id, name }, c);

    const [fromNext] = (await next.getByCarrierId(carrier_id, c)).filter((s) => s.name === name);
    assert.ok(fromNext, "the mirrored service did not come back");
    for (const key of ["supports_pickup", "supports_dropoff", "max_weight_lbs"]) {
      assert.ok(key in fromNext, `${key} is missing from the new-schema read`);
    }
    for (const key of ["supports_pickups", "supports_dropoffs", "max_weight_lb"]) {
      assert.equal(key in fromNext, false, `${key} leaked the new schema's name onto the wire`);
    }
  });
});

// Both implementations have to agree about column names, or promotion changes
// the response shape.
test("both implementations return the same keys", async () => {
  await inRollback(async (c) => {
    const carrier_id = await fedex(c);
    const name = aName();
    const created = await dual.create({ carrier_id, name }, c);

    const fromExchange = await exchange.getById(created.id, c);
    const [fromNext] = (await next.getByCarrierId(carrier_id, c)).filter((s) => s.name === name);

    assert.deepEqual(
      Object.keys(fromNext).sort(),
      Object.keys(fromExchange).sort(),
      "the two implementations disagree about the response shape"
    );
  });
});

// The real proof that the two implementations agree, independent of dev's data.
//
// `diff services` can only compare rows both schemas hold, and dev's exchange
// holds 2 of production's 8 - one of which lines up against a seed placeholder.
// This mirrors each exchange service into the new schema first, so both sides
// describe the same row, then compares every field except id.
test("a mirrored service reads back identically on both sides, field for field", async () => {
  await inRollback(async (c) => {
    const { rows: services } = await c.query(
      "SELECT id FROM exchange.carrier_services ORDER BY id"
    );
    assert.ok(services.length, "no services in exchange to compare");

    for (const { id } of services) {
      await next.mirrorService(id, c);

      const fromExchange = await exchange.getById(id, c);
      const [fromNext] = (await next.getByCarrierId(fromExchange.carrier_id, c))
        .filter((s) => s.name === fromExchange.name);

      assert.ok(fromNext, `${fromExchange.name} did not come back from the new schema`);

      for (const key of Object.keys(fromExchange)) {
        if (key === "id") continue;
        assert.deepEqual(
          fromNext[key], fromExchange[key],
          `${fromExchange.name}.${key} differs after mirroring`
        );
      }
    }
  });
});
