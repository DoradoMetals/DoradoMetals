// The carrier admin endpoints, over real HTTP - checks the wire shape end to end (nested organization) and that delete takes an id, not the whole body.
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction; the last test proves it from outside.
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

// No lock needed: carriers share no tables with the order/address test groups.
// UserFixture/Caller are the SELECT projection actually returned, not the full table row.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

let admin: Caller;
let customer: Caller;
const created: string[] = [];

before(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin user");

  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = { ...users[0], role: "user" };
  assert.ok(customer.id, "dev has no non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The shape frontend/features/carriers/queries.ts posts - the organization is its own nested object.
const newCarrier = () => ({
  logo: "/carriers/replay.png",
  organization: {
    name: `replay-carrier-${randomUUID().slice(0, 8)}`,
    email: "carrier@example.test",
    phone: "5550000000",
    enabled: true,
  },
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

      // A flat row would render undefined for every identity field - the frontend reads the nested shape.
      const c = res.body[0];
      for (const field of ["id", "logo", "organization"]) {
        assert.ok(field in c, `the carrier list is missing ${field}`);
      }
      for (const field of ["name", "email", "phone", "enabled"]) {
        assert.ok(field in c.organization, `the organization is missing ${field}`);
      }
      assert.ok(!("is_active" in c), "the flat shape came back after the conversion");
      assert.ok(c.organization.name, "a carrier came back with no name");
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

// The addresses bug, asked of carriers: the write must return the nested row exactly as stored.
test("creating a carrier returns it nested, with its name intact", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const res = await request(app).post("/api/carriers/create").send({ carrier });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      created.push(carrier.organization.name);

      const saved = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.equal(saved.organization.name, carrier.organization.name, "the name was lost");
      assert.equal(saved.organization.email, carrier.organization.email);
      assert.equal(saved.organization.enabled, true, "enabled was nulled on the way through");
      assert.ok(saved.id, "no id came back, so the frontend cannot select it");
      assert.ok(!("is_active" in saved), "the flat shape came back after the conversion");

      const list = await request(app).get("/api/carriers/get");
      assert.ok(
        list.body.some((c: { organization: { name: string } }) => c.organization.name === carrier.organization.name),
        "the carrier created a moment ago is not in the list"
      );
    });
  });
});

test("updating a carrier returns the updated row, still nested", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const made = await request(app).post("/api/carriers/create").send({ carrier });
      created.push(carrier.organization.name);

      const saved = Array.isArray(made.body) ? made.body[0] : made.body;
      const renamed = `${carrier.organization.name}-renamed`;
      // A clean patch, not the whole response spread back: the organization's
      // own id is not a field of this body (the service resolves it from the
      // carrier's own organization_id, read server-side) - the frontend
      // adapts (ruling 44).
      const res = await request(app)
        .post("/api/carriers/update")
        .send({
          carrier: {
            id: saved.id,
            logo: saved.logo,
            organization: {
              name: renamed,
              email: saved.organization.email,
              phone: saved.organization.phone,
              enabled: saved.organization.enabled,
            },
          },
        });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      created.push(renamed);

      const back = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.equal(back.organization.name, renamed, "the update response lost the new name");
      assert.equal(back.id, saved.id, "the update returned a different carrier");
    });
  });
});

// This endpoint had never once succeeded: the controller passed the whole body where the repo wanted an id.
test("deleting a carrier takes the carrier_id the frontend sends", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const carrier = newCarrier();
      const made = await request(app).post("/api/carriers/create").send({ carrier });
      created.push(carrier.organization.name);
      const saved = Array.isArray(made.body) ? made.body[0] : made.body;

      const res = await request(app)
        .delete("/api/carriers/delete")
        .send({ carrier_id: saved.id });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/carriers/get");
      assert.ok(
        !list.body.some((c: { id: string }) => c.id === saved.id),
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
