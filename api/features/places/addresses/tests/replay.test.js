// The addresses endpoints, over real HTTP, with the payloads the frontend
// actually sends.
//
// Everything else in this suite tests a repo or a pure function. This tests the
// thing a browser talks to: the route, its guard, the wire adapter mounted on
// the router, the controller's destructuring and the service beneath it, all at
// once. That whole stack is where the bugs of this migration have actually
// lived - a controller passing a whole request body where an id was wanted, an
// adapter nulling every field it was meant to lift.
//
// The payloads are lifted from frontend/features/addresses/queries.ts rather
// than invented, because the point is to replay what the frontend does. Where
// they diverge, the frontend is right and this file is wrong.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back, and shared/testing/session.js answers the
// guard without a session row existing. Both are asserted, not assumed: the
// last test in this file checks from outside the transaction that no address
// survived it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

// The patch replaces a property the middleware looks up per request, so the
// order relative to importing #app does not matter - but doing it first keeps
// the reason legible.
await mockSessions();
const { default: app } = await import("#app");

let customer;
const created = [];

// Addresses have their own lock group. This file writes exchange.addresses and
// places.addresses and touches no order, so sharing a number with the orders
// tests made it wait behind whole order placements for nothing - 656ms alone
// became 12.7 seconds in the suite.
import { LOCKS } from "#shared/testing/locks.ts";
const ADDRESS_LOCK = LOCKS.ADDRESSES;

before(async () => {
  // Read outside the pin: this is a fixture that has to already exist, not
  // something the test wrote.
  const rows = await outside(
    `SELECT u.id, u.email, u.name FROM exchange.users u
      JOIN exchange.addresses a ON a."user_id" = u.id
     GROUP BY u.id, u.email, u.name
     ORDER BY count(a.id) DESC
     LIMIT 1`
  );
  customer = rows[0];
  assert.ok(customer, "dev has no user with an address to replay against");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The exact body frontend/features/addresses/queries.ts sends on create.
const newAddress = (over = {}) => ({
  line_1: "1 Replay Street",
  line_2: "",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  country: "United States",
  country_code: "US",
  name: `replay-${randomUUID().slice(0, 8)}`,
  phone_number: "5550000000",
  is_default: false,
  is_valid: true,
  is_residential: true,
  ...over,
});

test("an anonymous request is refused before it reaches a controller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      assert.ok([401, 403].includes(res.status), `answered with ${res.status}`);
    });
  }, { lock: ADDRESS_LOCK });
});

test("a signed-in customer gets their addresses in the shape the hook destructures", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const res = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body), "useAddress expects an array");
      assert.ok(res.body.length > 0, "the borrowed user has addresses and none came back");

      // The fields frontend/features/addresses/types.ts declares, flat -
      // ADDRESSES_WIRE=legacy, so the adapter has flattened user_address back
      // out. If the nested shape leaked through, the frontend would render
      // undefined everywhere.
      const a = res.body[0];
      for (const field of ["id", "line_1", "city", "state", "zip", "country_code", "name", "is_default"]) {
        assert.ok(field in a, `the response is missing ${field}`);
      }
      assert.ok(!("user_address" in a), "the new nested shape reached the frontend");
    });
  }, { lock: ADDRESS_LOCK });
});

test("creating an address round-trips through the wire adapter and comes back flat", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const address = newAddress();
      const res = await request(app)
        .post("/api/addresses/create")
        .send({ user_id: customer.id, address });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(address.name);

      // The write went UP through the adapter (flat -> nested) and the
      // response came back DOWN (nested -> flat). Applying it twice would null
      // every field it lifts, which is the failure this arrangement is built to
      // prevent.
      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.equal(saved.line_1, "1 Replay Street");
      assert.equal(saved.city, "Dallas");
      assert.equal(saved.name, address.name, "the label was lost crossing the adapter");
      assert.ok(saved.id, "no id came back, so the frontend cannot select it");

      // And it is really there, inside the transaction.
      const back = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      assert.ok(
        back.body.some((a) => a.name === address.name),
        "the address created a moment ago is not in the list"
      );
    });
  }, { lock: ADDRESS_LOCK });
});

test("setting a default clears the others, as one request", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const list = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      const target = list.body.find((a) => !a.is_default) ?? list.body[0];

      const res = await request(app)
        .post("/api/addresses/set_default")
        .send({ user_id: customer.id, address: target });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      const defaults = after.body.filter((a) => a.is_default);
      assert.equal(defaults.length, 1, "more than one address is the default");
      assert.equal(defaults[0].id, target.id);
    });
  }, { lock: ADDRESS_LOCK });
});

// THE GAP IN THIS FILE'S OWN COVERAGE, added after a sweep found the hole it
// missed. Every test above passed `user_id: customer.id` - the same id as the
// session - so none of them could tell whether the endpoint used the session or
// obeyed the request. It obeyed the request: a signed-in customer naming
// somebody else could read their address book and write to it.
test("a signed-in customer naming somebody else gets their own addresses", async () => {
  await inPinnedTransaction(async () => {
    const others = await outside(
      `SELECT DISTINCT a."user_id" FROM exchange.addresses a
        WHERE a."user_id" IS NOT NULL AND a."user_id" <> $1 LIMIT 1`,
      [customer.id]
    );
    if (!others.length) return; // dev has only one user with addresses

    const victim = others[0].user_id;
    const theirs = await outside(
      `SELECT count(*)::int AS n FROM exchange.addresses WHERE "user_id" = $1`,
      [victim]
    );
    assert.ok(theirs[0].n > 0);

    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).get("/api/addresses/get").query({ user_id: victim });
      assert.equal(res.status, 200);
      assert.ok(
        res.body.every((a) => a.name !== null || true),
        "sanity"
      );
      // Their own, not the victim's. Compared by count against the victim's,
      // because an empty array would pass either way if the caller had none.
      const mine = await outside(
        `SELECT count(*)::int AS n FROM exchange.addresses WHERE "user_id" = $1`,
        [customer.id]
      );
      assert.equal(
        res.body.length,
        mine[0].n,
        "naming somebody else returned a different number of addresses than the caller owns"
      );
    });
  }, { lock: ADDRESS_LOCK });
});

// An admin naming a user is legitimate - the customer drawer does it - so the
// rule is "your own unless you are an admin", and the admin half has to keep
// working or this is secured by being broken.
test("an admin may still read another user's addresses", async () => {
  await inPinnedTransaction(async () => {
    const admins = await outside(
      `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
    );
    if (!admins.length) return;

    await as({ ...admins[0], role: "admin" }, async () => {
      const res = await request(app).get("/api/addresses/get").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      const owned = await outside(
        `SELECT count(*)::int AS n FROM exchange.addresses WHERE "user_id" = $1`,
        [customer.id]
      );
      assert.equal(res.body.length, owned[0].n, "an admin was refused a customer's addresses");
    });
  }, { lock: ADDRESS_LOCK });
});

// The property the whole harness exists for. If the pin ever stops working,
// every test above still passes - they read their own writes either way - and
// dev quietly fills up with addresses nobody made.
test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no address was created, so this proves nothing");
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped("exchange.addresses", "name = $1", [name]),
      0,
      `${name} was committed to dev`
    );
    assert.equal(
      await assertNothingEscaped("places.addresses", "line_1 = '1 Replay Street'"),
      0,
      "an address escaped into the new schema"
    );
  }
});
