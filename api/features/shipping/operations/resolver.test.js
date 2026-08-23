// Which provider a carrier id resolves to.
//
// resolveCarrier turns a carrier id into a provider by reading the carrier's
// *name* and lower-casing it: 'FedEx' becomes 'fedex', which is a key in
// PROVIDERS. Every label, rate and pickup goes through it.
//
// That makes the carrier's name load-bearing in a way nothing else in this
// migration is, and it is read through carriersRepo - which resolves the
// CARRIERS_SOURCE switch. The two implementations fetch the name from different
// places: exchange.carriers has a name column, while the new schema keeps it on
// the joined organizations row. If the migrated read ever returned a different
// spelling, a null, or dropped the join, every label would fail with
// "Unsupported carrier" on the deploy that promoted carriers.
//
// So the test is not that FedEx resolves - it is that BOTH implementations
// produce a name that resolves, which is the thing promotion could break.
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { PROVIDERS } from "#features/shipping/operations/registry.js";
import { BUILDERS } from "#features/shipping/operations/builders.js";
import { resolveCarrier } from "#features/shipping/operations/resolver.js";
import { FEDEX_CARRIER_ID } from "#providers/fedex/constants.js";
import * as exchangeCarriers from "#features/shipping/carriers/repo.exchange.js";
import * as nextCarriers from "#features/shipping/carriers/repo.next.js";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

const normalize = (name) => String(name || "").trim().toLowerCase();

describe("the carrier name every provider lookup depends on", () => {
  // The literal uuid in providers/fedex/constants.js has to keep pointing at
  // FedEx in both schemas. Migration notes say the carrier id survives; this
  // asserts it rather than trusting it.
  test("FEDEX_CARRIER_ID names FedEx in both implementations", async () => {
    for (const [label, repo] of [["exchange", exchangeCarriers], ["next", nextCarriers]]) {
      const carrier = await repo.getById(FEDEX_CARRIER_ID, client);
      assert.ok(carrier, `${label}: FEDEX_CARRIER_ID resolves to no carrier at all`);
      assert.equal(normalize(carrier.name), "fedex", `${label}: the name is "${carrier.name}"`);
    }
  });

  test("both implementations agree about every carrier's name", async () => {
    const fromExchange = await exchangeCarriers.getAll(client);
    const fromNext = await nextCarriers.getAll(client);

    for (const carrier of fromExchange) {
      const counterpart = fromNext.find((c) => c.id === carrier.id);
      assert.ok(counterpart, `${carrier.name} is missing from the new schema`);
      assert.equal(
        counterpart.name, carrier.name,
        `carrier ${carrier.id} is "${carrier.name}" in exchange and "${counterpart.name}" in the new schema`
      );
    }
  });

  // A carrier whose name does not resolve is not a bad request - it is a
  // shipment that cannot be created at all, and it would only show up when
  // somebody tried. Every carrier either has a provider, or is a known gap.
  test("every carrier either resolves to a provider or is one we have not built", async () => {
    const unimplemented = new Set(["ups", "usps"]);
    for (const carrier of await exchangeCarriers.getAll(client)) {
      const code = normalize(carrier.name);
      if (unimplemented.has(code)) continue;
      assert.ok(PROVIDERS[code], `carrier "${carrier.name}" has no provider registered`);
      assert.ok(BUILDERS[code], `carrier "${carrier.name}" has no builders registered`);
    }
  });
});

describe("resolveCarrier", () => {
  test("resolves FedEx to a provider and a full set of builders", async () => {
    const { code, provider, builders } = await resolveCarrier(FEDEX_CARRIER_ID, client);
    assert.equal(code, "fedex");
    assert.ok(provider);
    // Every operation the handler dispatches needs a builder; a missing one is
    // "builders.createLabel is not a function" at the moment of shipping.
    for (const op of [
      "validateAddress", "getRates", "createLabel", "cancelLabel",
      "checkPickup", "createPickup", "cancelPickup", "getTracking", "getLocations",
    ]) {
      assert.equal(typeof builders[op], "function", `no builder for ${op}`);
    }
  });

  // Pinning what currently happens. An unknown id makes getById return null and
  // the next line reads .name off it, so the error is a TypeError about null
  // rather than the "Unsupported carrier" message written two lines below.
  // Worth tidying, but it is a behaviour change rather than a test.
  test("an unknown carrier id throws, though not with the intended message", async () => {
    await assert.rejects(
      () => resolveCarrier("00000000-0000-4000-8000-000000000000", client),
      (err) => err instanceof TypeError,
      "this test is pinning known-rough behaviour, not endorsing it"
    );
  });
});

describe("every registered provider is usable", () => {
  // A provider without builders, or builders without a provider, resolves
  // halfway and fails at the call site.
  test("PROVIDERS and BUILDERS cover the same carriers", () => {
    assert.deepEqual(Object.keys(PROVIDERS).sort(), Object.keys(BUILDERS).sort());
  });
});
