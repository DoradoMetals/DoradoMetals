// Address dual-write tests against real Postgres.
//
// An address is two rows here: the postal address, which has no owner, and the
// user's link to it. Most of what can go wrong is the two drifting apart, or a
// deletion taking something an order still needs. Each test runs inside a
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as dual from "#features/addresses/repo.dual.js";
import * as next from "#features/addresses/repo.next.js";

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

const anAddress = async (c) =>
  (await c.query("SELECT id, user_id FROM exchange.addresses WHERE user_id IS NOT NULL ORDER BY id LIMIT 1")).rows[0];

test("creating an address writes both halves", async () => {
  await inRollback(async (c) => {
    const { user_id } = await anAddress(c);
    const created = await dual.create({
      userId: user_id,
      address: {
        line_1: "1 Test Way", line_2: "", city: "Dallas", state: "TX",
        country: "United States", zip: "75201",
        phone_number: "5550000000", country_code: "US",
        // The repos take the nested shape: what one person calls an address and
        // whether it is their default belongs to them, not to the address.
        user_address: { label: "Work", default_shipping: false },
      },
    }, c);

    const a = await c.query("SELECT line_1, city FROM places.addresses WHERE id = $1", [created.id]);
    const ua = await c.query(
      "SELECT user_id, label, default_shipping, default_billing FROM places.user_addresses WHERE address_id = $1",
      [created.id]
    );
    assert.equal(a.rows[0].line_1, "1 Test Way");
    assert.equal(ua.rows[0].user_id, user_id);
    assert.equal(ua.rows[0].label, "Work", "the name did not become the label");
  });
});

// exchange has one is_default; places has two. Both follow it until someone
// decides they should differ, and that has to stay true or a card would be
// billed to the wrong address.
test("one is_default sets both defaults", async () => {
  await inRollback(async (c) => {
    const { id, user_id } = await anAddress(c);
    await dual.setDefault({ userId: user_id, addressId: id }, c);

    const ua = await c.query(
      "SELECT default_shipping, default_billing FROM places.user_addresses WHERE address_id = $1", [id]
    );
    assert.equal(ua.rows[0].default_shipping, true);
    assert.equal(ua.rows[0].default_billing, true);
  });
});

// setDefault turns one on and the rest off in a single statement, so the whole
// book has to be re-mirrored - not just the address that was named.
test("setting a default clears the others in both schemas", async () => {
  await inRollback(async (c) => {
    const { user_id } = await anAddress(c);
    const { rows } = await c.query(
      "SELECT id FROM exchange.addresses WHERE user_id = $1 ORDER BY id", [user_id]
    );
    if (rows.length < 2) return; // needs two addresses to prove anything
    await dual.setDefault({ userId: user_id, addressId: rows[1].id }, c);

    const ua = await c.query(
      `SELECT ua.address_id, ua.default_shipping FROM places.user_addresses ua WHERE ua.user_id = $1`,
      [user_id]
    );
    const on = ua.rows.filter((r) => r.default_shipping);
    assert.equal(on.length, 1, "more than one default survived");
    assert.equal(on[0].address_id, rows[1].id);
  });
});

test("an edit reaches the postal address", async () => {
  await inRollback(async (c) => {
    const { id, user_id } = await anAddress(c);
    const city = `Probe-${randomUUID().slice(0, 6)}`;
    await dual.update({
      userId: user_id,
      address: {
        id, line_1: "9 Changed St", line_2: "", city, state: "TX",
        country: "United States", zip: "75201", name: "Home",
        is_default: false, phone_number: "5551111111", country_code: "US",
      },
    }, c);
    const a = await c.query("SELECT city FROM places.addresses WHERE id = $1", [id]);
    assert.equal(a.rows[0].city, city);
  });
});

// The one write where the two schemas differ on purpose. exchange deletes the
// row; here the link goes but the address survives if an order still points at
// it, because an order has to keep saying where it was actually sent.
test("removing an address keeps it if an order still points at it", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT e.id, e.user_id FROM exchange.addresses e
       JOIN orders.addresses oa ON oa.source_address_id = e.id LIMIT 1`
    );
    if (!rows.length) return;
    const { id, user_id } = rows[0];

    await dual.remove({ addressId: id, userId: user_id }, c);

    const gone = await c.query("SELECT 1 FROM exchange.addresses WHERE id = $1", [id]);
    const link = await c.query("SELECT 1 FROM places.user_addresses WHERE address_id = $1", [id]);
    const kept = await c.query("SELECT 1 FROM places.addresses WHERE id = $1", [id]);
    assert.equal(gone.rows.length, 0, "exchange still has it");
    assert.equal(link.rows.length, 0, "the user's link survived");
    assert.equal(kept.rows.length, 1, "an address an order was sent to was deleted");
  });
});

// What the order reads depend on: the id an order hands back has to resolve.
test("an id an order returns still resolves through getFromId", async () => {
  const { rows } = await client.query(
    "SELECT source_address_id AS id FROM orders.addresses WHERE source_address_id IS NOT NULL LIMIT 1"
  );
  if (!rows.length) return;
  const found = await next.getFromId(rows[0].id);
  assert.equal(found.length, 1, "the address an order points at cannot be resolved");
  assert.equal(found[0].id, rows[0].id);
});

test("rolling back a dual write undoes both sides", async () => {
  const other = await pool.connect();
  try {
    const { id, user_id } = await anAddress(other);
    const before = (await other.query("SELECT city FROM places.addresses WHERE id = $1", [id])).rows[0].city;
    const sentinel = `rolled-back-${randomUUID().slice(0, 6)}`;

    await client.query("BEGIN");
    await dual.update({
      userId: user_id,
      address: {
        id, line_1: "x", line_2: "", city: sentinel, state: "TX",
        country: "United States", zip: "1", name: "n",
        is_default: false, phone_number: "1", country_code: "US",
      },
    }, client);
    await client.query("ROLLBACK");

    const after = (await other.query("SELECT city FROM places.addresses WHERE id = $1", [id])).rows[0].city;
    assert.equal(after, before, "the mirror escaped the transaction");
  } finally {
    other.release();
  }
});

test("a dual write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const { id, user_id } = await anAddress(client);
    const sentinel = `uncommitted-${randomUUID().slice(0, 6)}`;
    await dual.update({
      userId: user_id,
      address: {
        id, line_1: "x", line_2: "", city: sentinel, state: "TX",
        country: "United States", zip: "1", name: "n",
        is_default: false, phone_number: "1", country_code: "US",
      },
    }, client);

    const inside = await client.query("SELECT city FROM places.addresses WHERE id = $1", [id]);
    assert.equal(inside.rows[0].city, sentinel, "the write did not happen at all");
    const seen = await other.query("SELECT city FROM places.addresses WHERE id = $1", [id]);
    assert.notEqual(seen.rows[0].city, sentinel, "an uncommitted write was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
