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

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. SELECT projections, not
// table rows.
type UserFixture = { id: string; name: string | null; email: string | null };

// The two wire shapes this file reads. The address split (D77) is exactly what
// they record: a postal row on /addresses/get, the relationship on
// /addresses/get_user_addresses.
type WireAddress = { id: string };
type WireLink = { address_id: string; label: string | null; default_shipping: boolean };

let customer: UserFixture;
const created: string[] = [];

// Addresses have their own lock group. This file writes exchange.addresses and
// places.addresses and touches no order, so sharing a number with the orders
// tests made it wait behind whole order placements for nothing - 656ms alone
// became 12.7 seconds in the suite.
import { LOCKS } from "#shared/testing/locks.ts";
const ADDRESS_LOCK = LOCKS.ADDRESSES;

before(async () => {
  // Read outside the pin: this is a fixture that has to already exist, not
  // something the test wrote.
  const rows = await outside<UserFixture>(
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

// The exact body frontend/features/addresses/queries.ts sends on create -
// SPLIT since the conversion (2026-08-27): the postal address and the
// caller's relationship to it travel as siblings, one call, never nested.
const newAddress = (over = {}) => ({
  address: {
    line_1: "1 Replay Street",
    line_2: "",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    country: "United States",
    country_code: "US",
    phone_number: "5550000000",
    is_valid: true,
    is_residential: true,
    ...over,
  },
  user_address: {
    label: `replay-${randomUUID().slice(0, 8)}`,
    default_shipping: false,
  },
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

      // Addresses is CONVERTED (2026-08-27): /get serves the postal address
      // ALONE - the caller's relationship travels on its own endpoint below.
      const a = res.body[0];
      for (const field of ["id", "line_1", "city", "state", "zip", "country_code"]) {
        assert.ok(field in a, `the response is missing ${field}`);
      }
      assert.ok(!("user_address" in a), "the relationship is nested inside the address again");
      assert.ok(!("is_default" in a), "the flat legacy shape came back");
      assert.ok(!("name" in a), "the owner's label is smeared across the address again");

      // The other half, joined by address_id.
      const links = await request(app)
        .get("/api/addresses/get_user_addresses")
        .query({ user_id: customer.id });
      assert.equal(links.status, 200);
      assert.equal(links.body.length, res.body.length, "one relationship per book entry");
      for (const field of ["address_id", "user_id", "label", "default_shipping"]) {
        assert.ok(field in links.body[0], `the relationship is missing ${field}`);
      }
      const ids = new Set(res.body.map((x: WireAddress) => x.id));
      assert.ok(
        links.body.every((l: WireLink) => ids.has(l.address_id)),
        "a relationship points at an address the list did not return"
      );
    });
  }, { lock: ADDRESS_LOCK });
});

test("creating an address round-trips in the split shape", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const address = newAddress();
      const res = await request(app)
        .post("/api/addresses/create")
        .send({ user_id: customer.id, ...address });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(address.user_address.label);

      // The response is the same split: the row and the relationship, apart.
      const saved = res.body;
      assert.equal(saved.address.line_1, "1 Replay Street");
      assert.equal(saved.address.city, "Dallas");
      assert.equal(saved.user_address.label, address.user_address.label, "the label was lost");
      assert.equal(saved.user_address.address_id, saved.address.id, "the halves do not join");
      assert.ok(saved.address.id, "no id came back, so the frontend cannot select it");

      // And it is really there, inside the transaction - via the links list,
      // which is where a label lives now.
      const back = await request(app)
        .get("/api/addresses/get_user_addresses")
        .query({ user_id: customer.id });
      assert.ok(
        back.body.some((l: WireLink) => l.label === address.user_address.label),
        "the address created a moment ago is not in the book"
      );
    });
  }, { lock: ADDRESS_LOCK });
});

test("setting a default clears the others, as one request", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const list = await request(app)
        .get("/api/addresses/get_user_addresses")
        .query({ user_id: customer.id });
      const target: WireLink = list.body.find((l: WireLink) => !l.default_shipping) ?? list.body[0];

      const res = await request(app)
        .post("/api/addresses/set_default")
        .send({ user_id: customer.id, address_id: target.address_id });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app)
        .get("/api/addresses/get_user_addresses")
        .query({ user_id: customer.id });
      const defaults = after.body.filter((l: WireLink) => l.default_shipping);
      assert.equal(defaults.length, 1, "more than one address is the default");
      assert.equal(defaults[0].address_id, target.address_id);
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
        res.body.every((a: WireAddress) => !("user_address" in a)),
        "sanity - the split holds on this path too"
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
    const admins = await outside<UserFixture>(
      `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
    );
    if (!admins.length) return;

    await as({ ...(admins[0] as UserFixture), role: "admin" }, async () => {
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
