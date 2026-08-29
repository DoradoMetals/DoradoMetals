// Every feature's schema switch defaults to exchange, and nothing is promoted.
//
// Promotion is the one irreversible step in this migration: reading from the
// new schema is safe, dual-writing is safe, but flipping a switch to `next` -
// or shipping a default of `dual` by accident - starts writing rows exchange
// will never see. From that point falling back loses whatever arrived in
// between.
//
// A grep proves that today. A test proves it after the next merge.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FEATURES = path.join(import.meta.dirname, "..", "..", "..", "features");

// Walked recursively rather than one level deep. shipping is organised as
// sub-features - shipping/shipments, shipping/tracking, shipping/carriers -
// each with its own repo.js and its own switch, and a one-level scan missed
// every one of them. carriers had been offering all three states unnoticed
// because of it.
type SwitchFile = { name: string; file: string; source: string };

const findSwitches = (dir: string): SwitchFile[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findSwitches(full);
    // repo.ts too - see the note in switch-surface.test.js. This file's floor
    // would have caught the rename (3 switches, floor of 3, any conversion
    // drops it to 2 and fails) but failing because a guard went blind is not
    // the same as not going blind.
    if (!/^repo\.(js|ts)$/.test(entry.name)) return [];
    const source = fs.readFileSync(full, "utf8");
    if (!/process\.env\.[A-Z_]+_SOURCE/.test(source)) return [];
    return [{ name: path.relative(FEATURES, full), file: full, source }];
  });

const switches = findSwitches(FEATURES);

test("every feature that has a switch defaults to exchange", () => {
  // See scripts/audit-switches.mjs: the floor drops by one each time a feature is
  // restructured away from having a switch at all. 2 since the wave-2 read
  // flip retired purchase-orders' switch; was 3.
  assert.ok(switches.length >= 2, `only found ${switches.length} switches`);

  for (const { name, source } of switches) {
    // The default is the fallback in `process.env.X_SOURCE ?? ""` ternaries:
    //   ? process.env.X_SOURCE
    //   : "exchange";
    const fallback = source.match(/:\s*"(\w+)";/);
    assert.ok(fallback, `${name}: could not find the switch default`);
    assert.equal(
      fallback[1],
      "exchange",
      `${name} defaults to "${fallback[1]}" - promotion is Jacob's call, and it is not reversible`
    );
  }
});

// `next` means writing only to the new schema. Every switch that offers it
// would be a one-way door, so none of them do yet: the map is { exchange, dual }
// or { exchange, next } for read-only features, never all three.
test("no switch offers a write-only-to-new state", () => {
  for (const { name, source } of switches) {
    const map = source.match(/const SOURCES = \{([^}]*)\}/);
    assert.ok(map, `${name}: could not find the SOURCES map`);
    const states = map[1].split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
    assert.ok(states.includes("exchange"), `${name}: no exchange state`);
    assert.equal(
      states.includes("dual") && states.includes("next"),
      false,
      `${name} offers both dual and next - writing only to the new schema is the one-way door and should be a deliberate, separate change`
    );
  }
});

// A switch reached by an unknown value must fall back rather than crash or,
// worse, resolve to undefined and take every read with it.
test("an unrecognised value falls back to exchange", () => {
  for (const { name, source } of switches) {
    assert.match(
      source,
      /Object\.hasOwn\(SOURCES,/,
      `${name}: does not check the env value against the known sources`
    );
  }
});
