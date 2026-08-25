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
import fs from "node:fs";
import path from "node:path";
import pool from "#db";
import { PROVIDERS } from "#features/shipping/operations/registry.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";
import { resolveCarrier } from "#features/shipping/operations/resolver.ts";
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
      // A carrier's name is its organization's now - see the comment in
      // resolver.js. Both implementations return it in the same place.
      const name = carrier.organization?.name ?? (carrier.organization?.name ?? carrier.name);
      assert.equal(normalize(name), "fedex", `${label}: the name is "${name}"`);
    }
  });

  test("both implementations agree about every carrier's name", async () => {
    const fromExchange = await exchangeCarriers.getAll(client);
    const fromNext = await nextCarriers.getAll(client);

    for (const carrier of fromExchange) {
      const counterpart = fromNext.find((c) => c.id === carrier.id);
      assert.ok(counterpart, `${(carrier.organization?.name ?? carrier.name)} is missing from the new schema`);
      const theirs = counterpart.organization?.name ?? counterpart.name;
      const ours = carrier.organization?.name ?? carrier.name;
      assert.equal(
        theirs, ours,
        `carrier ${carrier.id} is "${ours}" in exchange and "${theirs}" in the new schema`
      );
    }
  });

  // A carrier whose name does not resolve is not a bad request - it is a
  // shipment that cannot be created at all, and it would only show up when
  // somebody tried. Every carrier either has a provider, or is a known gap.
  test("every carrier either resolves to a provider or is one we have not built", async () => {
    const unimplemented = new Set(["ups", "usps"]);
    for (const carrier of await exchangeCarriers.getAll(client)) {
      const code = normalize((carrier.organization?.name ?? carrier.name));
      if (unimplemented.has(code)) continue;
      assert.ok(PROVIDERS[code], `carrier "${(carrier.organization?.name ?? carrier.name)}" has no provider registered`);
      assert.ok(BUILDERS[code], `carrier "${(carrier.organization?.name ?? carrier.name)}" has no builders registered`);
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
  // This used to pin known-rough behaviour: resolveCarrier read carrier.name off
  // an undefined carrier and threw a TypeError, which told the caller nothing.
  // Reading the name off the organization made it optional-chained, so an
  // unknown id now produces the error the code always meant to - accidentally
  // fixed by the reshape, and worth keeping.
  test("an unknown carrier id throws a message that says what went wrong", async () => {
    await assert.rejects(
      () => resolveCarrier("00000000-0000-4000-8000-000000000000", client),
      /Unsupported carrier/
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

// Every method the handler dispatches has to exist on the provider it reaches.
//
// This is what `provider.schedulePickup(...)` was: fedex.js exports
// createPickup and has never exported schedulePickup, so booking a carrier
// pickup threw "provider.schedulePickup is not a function" before any FedEx
// request was built or sent. Eight of the nine dispatch lines named their
// export correctly and the ninth did not, which is exactly the kind of thing
// nobody re-reads.
//
// TypeScript cannot catch it either - `provider` is a namespace import resolved
// at runtime out of PROVIDERS, so there is nothing to check the property
// against. Reading the dispatch lines back out of the file is the only way to
// tie the two halves together.
describe("the handler dispatches only methods its providers have", () => {
  const handler = fs.readFileSync(
    path.join(import.meta.dirname, "handler.js"), "utf8"
  );

  const dispatched = (object) =>
    [...handler.matchAll(new RegExp(`\\b${object}\\.([A-Za-z0-9_]+)\\(`, "g"))]
      .map((m) => m[1]);

  test("the dispatch lines were found at all", () => {
    // If this file is ever restructured, the regex above stops matching and
    // every assertion below passes vacuously.
    assert.ok(dispatched("provider").length >= 9, "found no provider dispatch lines to check");
    assert.ok(dispatched("builders").length >= 9, "found no builder dispatch lines to check");
  });

  test("every provider implements every method the handler calls", () => {
    for (const [name, provider] of Object.entries(PROVIDERS)) {
      for (const method of dispatched("provider")) {
        assert.equal(
          typeof provider[method], "function",
          `handler calls provider.${method}(), which ${name} does not export`
        );
      }
    }
  });

  test("every carrier has a builder for every method the handler calls", () => {
    for (const [name, builders] of Object.entries(BUILDERS)) {
      for (const method of dispatched("builders")) {
        assert.equal(
          typeof builders[method], "function",
          `handler calls builders.${method}(), which ${name} does not register`
        );
      }
    }
  });
});
