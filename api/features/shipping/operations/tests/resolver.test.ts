// Which provider a carrier id resolves to.
//
// resolveCarrier turns a carrier id into a provider by reading the carrier's
// *name* and lower-casing it: 'FedEx' becomes 'fedex', which is a key in
// PROVIDERS. Every label, rate and pickup goes through it.
//
// That makes the carrier's name load-bearing in a way nothing else in this
// migration is. Carriers has been restructured, so the read now comes from the
// new schema unconditionally: the name lives on the organization row, and a
// compose step that dropped it would fail every label with "Unsupported
// carrier".
//
// exchange.carriers is still written alongside and is still the record of
// truth, so the comparison is kept - it just runs against the table directly
// now rather than through a repo that no longer exists. What it asks has
// changed with it: not "do the two reads agree" but "did the dual write leave
// exchange holding the same name".
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import fs from "node:fs";
import path from "node:path";
import pool from "#db";
import { PROVIDERS } from "#features/shipping/operations/registry.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";
import { resolveCarrier } from "#features/shipping/operations/resolver.ts";
import { FEDEX_CARRIER_ID } from "#providers/shipments/constants.ts";
import * as carriers from "#features/shipping/carriers/service.ts";

let client: PoolClient;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

const normalize = (name: unknown): string => String(name || "").trim().toLowerCase();

describe("the carrier name every provider lookup depends on", () => {
  // The literal uuid in providers/shipments/constants.ts has to keep pointing at
  // FedEx in both schemas. Migration notes say the carrier id survives; this
  // asserts it rather than trusting it.
  test("FEDEX_CARRIER_ID names FedEx in the schema the resolver reads", async () => {
    const carrier = await carriers.getCarrierById(FEDEX_CARRIER_ID, client);
    assert.ok(carrier, "FEDEX_CARRIER_ID resolves to no carrier at all");
    // A carrier's name is its organization's now - see the comment in
    // resolver.ts.
    assert.equal(normalize(carrier.organization?.name), "fedex",
      `the name is "${carrier.organization?.name}"`);

    // And in exchange, which the dual write still maintains.
    const { rows } = await client.query(
      "SELECT name FROM exchange.carriers WHERE id = $1", [FEDEX_CARRIER_ID]
    );
    assert.equal(normalize(rows[0]?.name), "fedex",
      `exchange calls it "${rows[0]?.name}"`);
  });

  test("exchange holds the same name for every carrier the new schema serves", async () => {
    const { rows: fromExchange } = await client.query(
      "SELECT id, name FROM exchange.carriers"
    );
    assert.ok(fromExchange.length > 0, "dev has no carriers to compare");
    const fromNext = await carriers.getAllCarriers();

    for (const carrier of fromExchange) {
      const counterpart = fromNext.find((c) => c.id === carrier.id);
      assert.ok(counterpart, `${carrier.name} is missing from the new schema`);
      assert.equal(
        counterpart.organization?.name, carrier.name,
        `carrier ${carrier.id} is "${carrier.name}" in exchange and ` +
          `"${counterpart.organization?.name}" in the new schema`
      );
    }
  });

  // A carrier whose name does not resolve is not a bad request - it is a
  // shipment that cannot be created at all, and it would only show up when
  // somebody tried. Every carrier either has a provider, or is a known gap.
  test("every carrier either resolves to a provider or is one we have not built", async () => {
    const unimplemented = new Set(["ups", "usps"]);
    const all = await carriers.getAllCarriers();
    // The floor the two tests below lean on without saying so: an empty
    // PROVIDERS/BUILDERS is only caught HERE, and only if there is a carrier to
    // loop over. With no carriers, all three tests pass having checked nothing.
    assert.ok(all.length, "no carriers, so this test asserts nothing");
    for (const carrier of all) {
      const name = carrier.organization?.name;
      const code = normalize(name);
      if (unimplemented.has(code)) continue;
      // PROVIDERS and BUILDERS are registries keyed by carrier code, and the
      // code here comes from the database - so the lookup is a string index by
      // construction. Named as such rather than left an implicit any.
      assert.ok((PROVIDERS as Record<string, unknown>)[code], `carrier "${name}" has no provider registered`);
      assert.ok((BUILDERS as Record<string, unknown>)[code], `carrier "${name}" has no builders registered`);
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
      assert.equal(typeof (builders as Record<string, unknown>)[op], "function", `no builder for ${op}`);
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
  // READ LAZILY, INSIDE THE TESTS, AND BY EXTENSION-AGNOSTIC LOOKUP.
  //
  // This used to readFileSync("handler.js") in the describe body. Converting
  // the handler to TypeScript renamed the file, the read threw ENOENT, and the
  // three tests below stopped existing - while the suite stayed GREEN.
  //
  // That is worth stating plainly, because it is a hole in the gate this whole
  // project leans on: `node --test` prints a ✖ and the ENOENT for a describe
  // whose body throws, and then reports `fail 0` and EXITS 0. `pnpm check`
  // passed. The only visible symptom was the total dropping from 500 to 497.
  //
  // So the read happens inside a test, where a failure is counted, and it looks
  // for either extension - the handler may be .ts today and something else
  // later, and this test is about what it dispatches, not what it is written
  // in.
  const readHandler = () => {
    for (const name of ["handler.ts", "handler.js"]) {
      // ".." since the ruling-31 move: the handler sits in operations/ and
      // this test now sits in operations/tests/. Its own error message says
      // what to do if the handler moves; this is the test moving instead.
      const full = path.join(import.meta.dirname, "..", name);
      if (fs.existsSync(full)) return fs.readFileSync(full, "utf8");
    }
    throw new Error(
      "no handler.ts or handler.js beside this test - if the handler moved, " +
        "this check has lost its subject and must be pointed at the new one"
    );
  };

  const dispatched = (object: string): string[] =>
    [...readHandler().matchAll(new RegExp(`\\b${object}\\.([A-Za-z0-9_]+)\\(`, "g"))]
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
          typeof (provider as Record<string, unknown>)[method], "function",
          `handler calls provider.${method}(), which ${name} does not export`
        );
      }
    }
  });

  test("every carrier has a builder for every method the handler calls", () => {
    for (const [name, builders] of Object.entries(BUILDERS)) {
      for (const method of dispatched("builders")) {
        assert.equal(
          typeof (builders as Record<string, unknown>)[method], "function",
          `handler calls builders.${method}(), which ${name} does not register`
        );
      }
    }
  });
});
