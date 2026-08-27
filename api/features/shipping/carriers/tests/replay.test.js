// The carrier admin endpoints, over real HTTP.
//
// Carriers have a RESHAPING wire adapter - the organization is its own object
// internally and flat on the wire - which is the same arrangement that returned
// a nameless address from features/addresses. That bug was invisible to a repo
// test because the repo returned the right row and the damage happened in
// middleware afterwards. These ask the same question of carriers.
//
// The delete endpoint is the other reason. It was recorded as having never
// succeeded: the controller passed the whole request body where the repo wanted
// an id. That was fixed; this is what would notice if it came back.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction, and
// the last test proves it from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// Carriers are reference data and share no tables with the order or address
// groups, so this file needs no lock: nothing else in the suite writes
// shipping.carriers or the organizations behind them.
let admin;
let customer;
const created = [];

before(async () => {
  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin user");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = { ...users[0], role: "user" };
  assert.ok(customer.id, "dev has no non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The flat shape frontend/features/carriers/queries.ts posts.
const newCarrier = () => ({
  name: `replay-carrier-${randomUUID().slice(0, 8)}`,
  email: "carrier@example.test",
  phone: "5550000000",
  logo: "/carriers/replay.png",
  is_active: true,
});

test("the carrier list is served to a user and refused to nobody", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/carriers/get");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });

    await as(customer, async () => {
      const res = await request(app).get("/api/carriers/get");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // CARRIERS_WIRE=legacy, so the organization has been flattened back out.
      // The nested shape reaching the frontend would render undefined for every
      // one of these.
      const c = res.body[0];
      for (const field of ["id", "name", "email", "phone", "is_active"]) {
        assert.ok(field in c, `the carrier list is missing ${field}`);
      }
      assert.ok(!("organization" in c), "the nested shape reached the frontend");
      assert.ok(c.name, "a carrier came back with no name - the adapter flattened twice");
    });
  });
});

test("only an admin may create a carrier", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const res = await request(app)
        .post("/api/carriers/create")
        .send({ carrier: newCarrier() });
      assert.equal(res.status, 403, "a customer created a carrier");
    });
  });
});

// The addresses bug, asked of carriers: a write returning the internal shape
// where the adapter expects to flatten one, or returning an already-flat row
// the adapter then nulls.
test("creating a carrier returns it flat, with its name intact", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const res = await request(app).post("/api/carriers/create").send({ carrier });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      created.push(carrier.name);

      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.equal(saved.name, carrier.name, "the name was lost crossing the adapter");
      assert.equal(saved.email, carrier.email);
      assert.equal(saved.is_active, true, "is_active was nulled by a second flatten");
      assert.ok(saved.id, "no id came back, so the frontend cannot select it");
      assert.ok(!("organization" in saved), "the nested shape reached the frontend");

      const list = await request(app).get("/api/carriers/get");
      assert.ok(
        list.body.some((c) => c.name === carrier.name),
        "the carrier created a moment ago is not in the list"
      );
    });
  });
});

test("updating a carrier returns the updated row, still flat", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const made = await request(app).post("/api/carriers/create").send({ carrier });
      created.push(carrier.name);

      const saved = Array.isArray(made.body) ? made.body[0] : made.body;
      const renamed = `${carrier.name}-renamed`;
      const res = await request(app)
        .post("/api/carriers/update")
        .send({ carrier: { ...saved, name: renamed } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(renamed);

      const back = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.equal(back.name, renamed, "the update response lost the new name");
      assert.equal(back.id, saved.id, "the update returned a different carrier");
    });
  });
});

// This endpoint had never once succeeded: the controller passed req.body where
// the repo wanted an id, so the delete ran WHERE id = <object> and died on
// "invalid input syntax for type uuid". The frontend sends { carrier_id }.
test("deleting a carrier takes the carrier_id the frontend sends", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const made = await request(app).post("/api/carriers/create").send({ carrier });
      created.push(carrier.name);
      const saved = Array.isArray(made.body) ? made.body[0] : made.body;

      const res = await request(app)
        .delete("/api/carriers/delete")
        .send({ carrier_id: saved.id });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/carriers/get");
      assert.ok(
        !list.body.some((c) => c.id === saved.id),
        "the carrier is still there after a successful delete"
      );
    });
  });
});

test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no carrier was created, so this proves nothing");
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped("organizations.organizations", "name = $1", [name]),
      0,
      `${name} was committed to dev`
    );
  }
  assert.equal(
    await assertNothingEscaped("exchange.carriers", "name LIKE 'replay-carrier-%'"),
    0,
    "a replay carrier escaped into exchange"
  );
});
