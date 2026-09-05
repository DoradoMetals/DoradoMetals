import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.ts";
import { anUnknownId, aUser, anAdmin, anAddress, type BuiltUser } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

type WireEntry = {
  address: { id: string };
  user_address: { address_id: string; recipient_name: string | null; default_shipping: boolean };
  actions: { edit: boolean; remove: boolean; set_default: boolean };
};

const created: string[] = [];

import { LOCKS } from "#shared/testing/locks.ts";
const ADDRESS_LOCK = LOCKS.ADDRESSES;

const sessionOf = (u: BuiltUser, role = "user") => ({ id: u.id, name: u.name, email: u.email, role });

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

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
    ...over,
  },
  user_address: {
    recipient_name: `replay-${randomUUID().slice(0, 8)}`,
    label: "Home",
    default_shipping: false,
  },
});

test("an anonymous request is refused before it reaches a controller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/addresses").query({ user_id: anUnknownId() });
      assert.ok([401, 403].includes(res.status), `answered with ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

test("a signed-in customer gets their book as entries, each carrying its own actions", async () => {
  await inPinnedTransaction(async (c) => {
    const owner = await aUser(c);
    await anAddress(c, owner);
    const customer = sessionOf(owner);

    await as(customer, async () => {
      const res = await request(app).get("/api/addresses").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body), "the book is a list");
      assert.ok(res.body.length > 0, "the built user has an address and none came back");

      const entry: WireEntry = res.body[0];
      assert.deepEqual(Object.keys(entry).sort(), ["actions", "address", "user_address"]);
      for (const field of ["id", "line_1", "city", "state", "zip", "country_code"]) {
        assert.ok(field in entry.address, `the address is missing ${field}`);
      }
      assert.ok(!("name" in entry.address), "the recipient is smeared across the address again");
      assert.ok(!("user_address" in entry.address), "the link is nested inside the address again");
      for (const field of ["address_id", "user_id", "recipient_name", "label", "default_shipping"]) {
        assert.ok(field in entry.user_address, `the link is missing ${field}`);
      }
      assert.deepEqual(Object.keys(entry.actions).sort(), ["edit", "remove", "set_default"]);
      assert.equal(entry.user_address.address_id, entry.address.id, "the halves do not join");
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

test("creating an address answers 201 and the entry it made", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = sessionOf(await aUser(c));
    await as(customer, async () => {
      const address = newAddress();
      const res = await request(app).post("/api/addresses").send(address);

      assert.equal(res.status, 201, JSON.stringify(res.body));
      created.push(address.user_address.recipient_name);

      const saved: WireEntry & { address: { line_1: string; city: string } } = res.body;
      assert.equal(saved.address.line_1, "1 Replay Street");
      assert.equal(saved.address.city, "Dallas");
      assert.equal(saved.user_address.recipient_name, address.user_address.recipient_name,
        "the recipient was lost");
      assert.equal(saved.user_address.address_id, saved.address.id, "the halves do not join");
      assert.ok(saved.address.id, "no id came back, so the frontend cannot select it");
      assert.equal(saved.user_address.default_shipping, true);

      const back = await request(app).get("/api/addresses");
      assert.ok(
        back.body.some((e: WireEntry) => e.user_address.recipient_name === address.user_address.recipient_name),
        "the address created a moment ago is not in the book"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

test("setting a default clears the others, as one request", async () => {
  await inPinnedTransaction(async (c) => {
    const owner = await aUser(c);
    await anAddress(c, owner, { default_shipping: true });
    await anAddress(c, owner, { default_shipping: false });
    const customer = sessionOf(owner);

    await as(customer, async () => {
      const list = await request(app).get("/api/addresses");
      const target: WireEntry =
        list.body.find((e: WireEntry) => !e.user_address.default_shipping) ?? list.body[0];
      assert.equal(target.actions.set_default, true, "the entry did not offer to become the default");

      const res = await request(app).post(`/api/addresses/${target.address.id}/default`);
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app).get("/api/addresses");
      const defaults = after.body.filter((e: WireEntry) => e.user_address.default_shipping);
      assert.equal(defaults.length, 1, "more than one address is the default");
      assert.equal(defaults[0].address.id, target.address.id);
      assert.equal(defaults[0].actions.set_default, false, "the default still offers to become one");
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

test("a signed-in customer naming somebody else gets their own addresses", async () => {
  await inPinnedTransaction(async (c) => {
    const caller = await aUser(c);
    await anAddress(c, caller);
    const victim = await aUser(c);
    await anAddress(c, victim);
    await anAddress(c, victim, { default_shipping: false });

    await as(sessionOf(caller), async () => {
      const res = await request(app).get("/api/addresses").query({ user_id: victim.id });
      assert.equal(res.status, 200);
      assert.ok(
        res.body.every((e: WireEntry) => !("user_address" in e.address)),
        "sanity - the split holds on this path too"
      );
      assert.equal(
        res.body.length,
        1,
        "naming somebody else returned a different number of addresses than the caller owns"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

test("an admin may still read another user's addresses", async () => {
  await inPinnedTransaction(async (c) => {
    const admin = await anAdmin(c);
    const customer = await aUser(c);
    await anAddress(c, customer);
    await anAddress(c, customer, { default_shipping: false });

    await as(sessionOf(admin, "admin"), async () => {
      const res = await request(app).get("/api/addresses").query({ user_id: customer.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2, "an admin was refused a customer's addresses");
    });
  }, { actor: TEST_ACTOR.id, lock: ADDRESS_LOCK });
});

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
