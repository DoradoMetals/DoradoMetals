// Addresses through the service, against real Postgres.
//
// An address is two rows in the new schema - places.addresses, which is
// somewhere on earth, and places.user_addresses, which is one person's
// relationship to it - plus one flat row in exchange, and all three are written
// together.
//
// THE ONE TO GET RIGHT IS OWNERSHIP. exchange scoped every write in the
// statement (`WHERE id = $1 AND user_id = $2`) because the address carried its
// owner. places.addresses has no user_id, so the check moved into service.ts,
// and if it were ever lost the exchange statement would still refuse while the
// new schema accepted - leaving the two disagreeing about a stranger's address.
// Several of these exist only to notice that.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#features/places/addresses/service.ts";

let client;
let owner;
let stranger;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();

  const { rows } = await client.query(
    "SELECT id FROM exchange.users ORDER BY id LIMIT 2"
  );
  owner = rows[0]?.id;
  stranger = rows[1]?.id;
  assert.ok(owner && stranger, "dev needs two users for the ownership tests");
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

// The two halves as the service takes them since the split (2026-08-28):
// the postal address and the caller's relationship, siblings, one call.
const draft = (over = {}, ua = {}) => ({
  address: {
    line_1: "1 Test Street",
    line_2: null,
    city: "Austin",
    state: "TX",
    country: "United States",
    zip: "78701",
    country_code: "US",
    phone_number: "5550000000",
    ...over,
  },
  user_address: { label: `probe-${randomUUID().slice(0, 8)}`, default_shipping: false, ...ua },
});

test("create writes both new rows and the exchange row under one id", async () => {
  await inRollback(async (c) => {
    const input = draft();
    const made = await service.create({ ...input, userId: owner }, c);

    assert.ok(made.id);
    assert.equal(made.line_1, input.address.line_1);
    assert.equal(made.user_address.label, input.user_address.label);
    assert.equal(made.user_address.user_id, owner);

    const { rows: addr } = await c.query(
      "SELECT id FROM places.addresses WHERE id = $1", [made.id]
    );
    const { rows: link } = await c.query(
      "SELECT user_id, label FROM places.user_addresses WHERE address_id = $1", [made.id]
    );
    const { rows: ex } = await c.query(
      "SELECT id, user_id, name, line_1 FROM exchange.addresses WHERE id = $1", [made.id]
    );

    assert.equal(addr.length, 1, "no postal address was written");
    assert.equal(link.length, 1, "no link was written");
    assert.equal(link[0].user_id, owner);
    assert.equal(ex.length, 1, "the address never reached exchange");
    assert.equal(ex[0].user_id, owner, "exchange lost whose address it is");
    assert.equal(ex[0].name, input.user_address.label, "the label did not reach exchange's name");
  });
});

// exchange's create wrote is_valid TRUE and is_residential FALSE as literals,
// not from the caller. Address validation sets the real ones afterwards.
test("a new address is valid and non-residential until validation says otherwise", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);
    assert.equal(made.is_valid, true);
    assert.equal(made.is_residential, false);

    const { rows } = await c.query(
      "SELECT is_valid, is_residential FROM exchange.addresses WHERE id = $1", [made.id]
    );
    assert.equal(rows[0].is_valid, true);
    assert.equal(rows[0].is_residential, false);
  });
});

test("the list is that person's addresses, defaults first", async () => {
  await inRollback(async (c) => {
    await service.create({ ...draft(), userId: owner }, c);
    const marked = await service.create(
      { ...draft({}, { label: "the default", default_shipping: true }),
        userId: owner }, c
    );

    const rows = await service.list(owner, c);
    assert.ok(rows.length >= 2);

    // NOT `rows[0].id === marked.id`. That was the first version and it was
    // flaky by construction: the owner may already HAVE a default address in
    // dev, and the tiebreak among defaults is the id - which is a random uuid
    // here, so it won a coin toss most of the time. What the sort actually
    // promises is that every default precedes every non-default.
    const marks = rows.map((r) => r.user_address.default_shipping === true);
    assert.equal(marks.indexOf(false) === -1 || marks.lastIndexOf(true) < marks.indexOf(false),
      true, "a non-default address sorted above a default one");
    assert.ok(
      rows.findIndex((r) => r.id === marked.id) < (marks.indexOf(false) === -1 ? rows.length : marks.indexOf(false)),
      "the address just marked default did not sort among the defaults"
    );

    // Every row is this user's, and every one carries the nested object the
    // wire adapter flattens.
    for (const row of rows) {
      assert.equal(row.user_address.user_id, owner);
      assert.deepEqual(Object.keys(row.user_address).sort(),
        ["default_shipping", "label", "user_id"]);
    }
  });
});

// An address with no user_addresses row is a snapshot taken for an order, not
// something in anyone's book. exchange's list would never have returned it and
// neither does this - an inner join by another name.
test("an address with no link is not in anybody's list", async () => {
  await inRollback(async (c) => {
    const id = randomUUID();
    await c.query(
      "INSERT INTO places.addresses (id, line_1, city, state) VALUES ($1, $2, $3, $4)",
      [id, "orphan", "Austin", "TX"]
    );
    const rows = await service.list(owner, c);
    assert.ok(!rows.some((r) => r.id === id), "an unlinked address reached a list");
    assert.deepEqual(await service.getFromId(id, c), [],
      "an unlinked address came back from getFromId");
  });
});

// getFromId returns a LIST and getAddressFromId returns a ROW. Both call sites
// depend on which is which - see features/sales-orders/address-state.test.js.
test("getFromId returns a list and getAddressFromId returns the row", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);

    const list = await service.getFromId(made.id, c);
    assert.ok(Array.isArray(list), "getFromId stopped returning a list");
    assert.equal(list[0].state, "TX");

    const one = await service.getAddressFromId(made.id, c);
    assert.ok(!Array.isArray(one), "getAddressFromId started returning a list");
    assert.equal(one.state, "TX");
  });
});

test("update changes both schemas", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);
    const updated = await service.update(
      { address: { ...made, city: "Dallas" },
        user_address: { label: "renamed", default_shipping: true },
        userId: owner }, c
    );

    assert.equal(updated.city, "Dallas");
    assert.equal(updated.user_address.label, "renamed");
    assert.equal(updated.user_address.default_shipping, true);

    const { rows } = await c.query(
      "SELECT city, name, is_default FROM exchange.addresses WHERE id = $1", [made.id]
    );
    assert.equal(rows[0].city, "Dallas", "exchange still holds the old city");
    assert.equal(rows[0].name, "renamed", "the label did not reach exchange's name");
    assert.equal(rows[0].is_default, true, "default_shipping did not reach exchange's is_default");
  });
});

// THE CHECK THAT MOVED OUT OF THE STATEMENT. A stranger must not be able to
// rewrite an address by id, and - because exchange's statement is still scoped -
// the failure mode without this check is the two schemas disagreeing rather
// than a visible error.
test("a stranger cannot update somebody else's address", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);

    await assert.rejects(
      () => service.update(
        { address: { ...made, city: "Stolen" }, userId: stranger }, c
      ),
      /Address not found/
    );

    const { rows: nx } = await c.query(
      "SELECT city FROM places.addresses WHERE id = $1", [made.id]
    );
    const { rows: ex } = await c.query(
      "SELECT city FROM exchange.addresses WHERE id = $1", [made.id]
    );
    assert.equal(nx[0].city, "Austin", "a stranger rewrote the new schema's copy");
    assert.equal(ex[0].city, "Austin", "a stranger rewrote exchange's copy");
  });
});

test("a stranger's delete removes nothing", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);
    await service.remove({ addressId: made.id, userId: stranger }, c);

    const { rows: link } = await c.query(
      "SELECT 1 FROM places.user_addresses WHERE address_id = $1 AND user_id = $2",
      [made.id, owner]
    );
    const { rows: ex } = await c.query(
      "SELECT 1 FROM exchange.addresses WHERE id = $1", [made.id]
    );
    assert.equal(link.length, 1, "a stranger deleted somebody else's link");
    assert.equal(ex.length, 1, "a stranger deleted somebody else's exchange row");
  });
});

test("deleting removes the link, the address and the exchange row", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);
    assert.equal(await service.remove({ addressId: made.id, userId: owner }, c),
      "Deleted address.");

    const { rows: link } = await c.query(
      "SELECT 1 FROM places.user_addresses WHERE address_id = $1", [made.id]
    );
    const { rows: addr } = await c.query(
      "SELECT 1 FROM places.addresses WHERE id = $1", [made.id]
    );
    const { rows: ex } = await c.query(
      "SELECT 1 FROM exchange.addresses WHERE id = $1", [made.id]
    );
    assert.equal(link.length, 0);
    assert.equal(addr.length, 0);
    assert.equal(ex.length, 0);
  });
});

// An address an order snapshotted must survive leaving somebody's book, or the
// order loses where it went.
test("an address an order points at survives being removed from a book", async () => {
  await inRollback(async (c) => {
    const made = await service.create({ ...draft(), userId: owner }, c);

    // orders.addresses is a LINK, not a copy of the fields: it records the
    // snapshot the order took (address_id) and the address book row that
    // snapshot came from (source_address_id). It also carries
    // `addresses_one_per_order`, so this points an EXISTING row at our address
    // rather than inserting a second one for the same order.
    const { rows: [orderLink] } = await c.query(
      "SELECT id FROM orders.addresses LIMIT 1"
    );
    if (!orderLink) return; // dev has no order carrying an address

    await c.query(
      "UPDATE orders.addresses SET source_address_id = $1 WHERE id = $2",
      [made.id, orderLink.id]
    );

    await service.remove({ addressId: made.id, userId: owner }, c);

    const { rows: link } = await c.query(
      "SELECT 1 FROM places.user_addresses WHERE address_id = $1", [made.id]
    );
    const { rows: addr } = await c.query(
      "SELECT 1 FROM places.addresses WHERE id = $1", [made.id]
    );
    assert.equal(link.length, 0, "the link should still go");
    assert.equal(addr.length, 1,
      "the address an order snapshotted was deleted with the link");
  });
});

test("setting a default clears the others, in both schemas", async () => {
  await inRollback(async (c) => {
    const first = await service.create(
      { address: draft({ user_address: { label: "a", default_shipping: true } }), userId: owner }, c
    );
    const second = await service.create({ address: draft(), userId: owner }, c);

    await service.setDefault({ userId: owner, addressId: second.id }, c);

    const { rows: nx } = await c.query(
      `SELECT address_id, default_shipping, default_billing
         FROM places.user_addresses WHERE user_id = $1`, [owner]
    );
    // Two were just created. An empty nx means neither write landed - the exact
    // failure this test exists to catch - so it must not pass vacuously.
    assert.ok(nx.length >= 2, "the addresses just created are not in the book");
    for (const row of nx) {
      const expected = row.address_id === second.id;
      assert.equal(row.default_shipping, expected, "default_shipping is wrong somewhere");
      // exchange has one flag, so both follow it.
      assert.equal(row.default_billing, expected, "default_billing did not follow");
    }

    const { rows: ex } = await c.query(
      "SELECT id, is_default FROM exchange.addresses WHERE user_id = $1", [owner]
    );
    for (const row of ex) {
      assert.equal(row.is_default, row.id === second.id, "exchange's default disagrees");
    }
    assert.ok(nx.some((r) => r.address_id === first.id && r.default_shipping === false),
      "the address that used to be the default is still one");
  });
});

test("an address on an unfinished order can be neither edited nor deleted", async () => {
  await inRollback(async (c) => {
    const { rows: [live] } = await c.query(
      `SELECT oa.source_address_id AS address_id, o.user_id
         FROM orders.orders o
         JOIN orders.addresses oa ON oa.order_id = o.id
        WHERE oa.source_address_id IS NOT NULL
          AND o.status IS DISTINCT FROM 'Completed'
        LIMIT 1`
    );
    if (!live) return; // dev has no unfinished order with an address

    assert.equal(await service.isActive(live.address_id, live.user_id, c), true);
    await assert.rejects(
      () => service.update(
        { address: { id: live.address_id, city: "Nope" }, userId: live.user_id }, c
      ),
      /associated with an active order/
    );
    await assert.rejects(
      () => service.remove({ addressId: live.address_id, userId: live.user_id }, c),
      /associated with an active order/
    );
  });
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const made = await service.create({ address: draft(), userId: owner }, client);
  const outsideRows = await service.getFromId(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.deepEqual(outsideRows, []);
});
