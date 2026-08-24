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
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.js";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.js";

// The patch replaces a property the middleware looks up per request, so the
// order relative to importing #app does not matter - but doing it first keeps
// the reason legible.
await mockSessions();
const { default: app } = await import("#app");

let customer;
const created = [];

// Shared with features/orders, which snapshots addresses while placing an
// order. A pinned transaction holds its row locks for a whole request, so
// without this the orders tests sit behind it.
const ADDRESS_LOCK = 4213;

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
