// The machinery behind every *_WIRE switch, which had no test.
//
// makeWireAdapter converts a response DOWN to the legacy field names on the way
// out and back UP on the way in; wireShape mounts that on a router. Together
// they decide what shape leaves the API, which is the axis D32 is about - and
// the safe direction matters more than the happy path, because getting it wrong
// sends a frontend a shape it has never seen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeWireAdapter } from "#shared/wire/rename.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const ENV = "TEST_ONLY_WIRE";
const build = (value, names = { name: "type", ask: "ask_spot" }) => {
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
  const adapter = makeWireAdapter({ env: ENV, names });
  delete process.env[ENV];
  return adapter;
};

test("legacy renames on the way out; next sends the new shape untouched", () => {
  assert.deepEqual(build("legacy").toWire({ name: "Gold", ask: 1 }), { type: "Gold", ask_spot: 1 });
  assert.deepEqual(build("next").toWire({ name: "Gold", ask: 1 }), { name: "Gold", ask: 1 });
});

// The direction that matters. An unset switch, or one holding a typo, must not
// select the shape the frontend has never seen.
test("an unset or unrecognised switch falls back to legacy, never to next", () => {
  for (const value of [undefined, "", "next ", "NEXT", "banana", "true", "1"]) {
    const adapter = build(value);
    assert.equal(adapter.activeShape, "legacy", `${JSON.stringify(value)} selected ${adapter.activeShape}`);
    assert.deepEqual(adapter.toWire({ name: "Gold" }), { type: "Gold" });
  }
});

test("fields nobody renamed come through untouched - the whole contract", () => {
  const row = { name: "Gold", ask: 1, id: "abc", nobody_declared_this: { deep: true } };
  assert.deepEqual(build("legacy").toWire(row), {
    type: "Gold",
    ask_spot: 1,
    id: "abc",
    nobody_declared_this: { deep: true },
  });
});

test("fromWire converts whatever the switch says", () => {
  // A request in the legacy shape is converted up; one already in the new shape
  // is untouched, because the legacy names are not there to rename.
  for (const shape of ["legacy", "next"]) {
    const a = build(shape);
    assert.deepEqual(a.fromWire({ type: "Gold", ask_spot: 1 }), { name: "Gold", ask: 1 });
    assert.deepEqual(a.fromWire({ name: "Gold", ask: 1 }), { name: "Gold", ask: 1 });
  }
});

test("a list is converted element by element", () => {
  assert.deepEqual(build("legacy").toWire([{ name: "Gold" }, { name: "Silver" }]), [
    { type: "Gold" },
    { type: "Silver" },
  ]);
});

test("nothing, and things that are not rows, pass through", () => {
  const a = build("legacy");
  for (const v of [null, undefined, true, "a message", 42]) assert.deepEqual(a.toWire(v), v);
  assert.deepEqual(a.toWire([]), []);
});

test("reading it backwards returns the row it started as", () => {
  const a = build("legacy");
  const row = { name: "Gold", ask: 1, id: "abc" };
  assert.deepEqual(a.fromLegacy(a.toLegacy(row)), row);
});

// Applying the rename twice must be harmless, because wireShape can be mounted
// by both a router and a route. It is only harmless while no legacy name is
// also a new name - see the structural check at the bottom.
test("renaming twice changes nothing the second time", () => {
  const a = build("legacy");
  const once = a.toLegacy({ name: "Gold", ask: 1 });
  assert.deepEqual(a.toLegacy(once), once);
});

// The sharp edge. rename() writes into a fresh object, so if a row ALREADY
// holds the key a rename is about to write, one of the two values is lost and
// nothing says so. No real adapter can hit this today - the structural test
// below is what keeps that true - but the behaviour is worth stating.
test("a row already carrying a legacy name silently loses one of the two", () => {
  const a = build("legacy");
  const out = a.toLegacy({ name: "from name", type: "from type" });
  assert.equal(Object.keys(out).length, 1, "one field was silently dropped");
  assert.equal(out.type, "from type", "and the row's own value won, not the renamed one");
});

const fakeRes = () => {
  const sent = [];
  const res = { json: (payload) => { sent.push(payload); return res; } };
  return { res, sent };
};

test("wireShape converts what a handler sends", () => {
  const { res, sent } = fakeRes();
  wireShape(build("legacy"))({ body: undefined }, res, () => {});
  res.json({ name: "Gold" });
  assert.deepEqual(sent, [{ type: "Gold" }]);
});

// This must be checked with an adapter that is NOT idempotent. A rename applied
// twice renames nothing the second time, so a rename adapter cannot tell the
// difference and a test built on one passes with the guard deleted - it did.
// The guard exists for the RESHAPE adapters, where flatten() run on an
// already-flat object nulls every field it meant to lift.
const counting = () => {
  const calls = { out: 0, in: 0 };
  return {
    calls,
    toWire: (d) => { calls.out += 1; return { ...d, applied: calls.out }; },
    fromWire: (d) => { calls.in += 1; return { ...d, applied: calls.in }; },
  };
};

test("wireShape applies once per response, so a second mount is a no-op", () => {
  const { res, sent } = fakeRes();
  const adapter = counting();
  let nexts = 0;
  const req = { body: { a: 1 } };
  wireShape(adapter)(req, res, () => nexts++);
  wireShape(adapter)(req, res, () => nexts++);
  res.json({ name: "Gold" });
  assert.equal(nexts, 2, "both mounts must call next");
  assert.equal(adapter.calls.out, 1, "the outbound adapter ran more than once");
  assert.equal(adapter.calls.in, 1, "the inbound adapter ran more than once");
  assert.deepEqual(sent, [{ name: "Gold", applied: 1 }]);
});

test("wireShape converts the named key of the body, and leaves the rest alone", () => {
  const req = { body: { spot: { type: "Gold", ask_spot: 1 }, user_id: "u1" } };
  wireShape(build("legacy"), { body: "spot" })(req, fakeRes().res, () => {});
  assert.deepEqual(req.body, { spot: { name: "Gold", ask: 1 }, user_id: "u1" });
});

test("wireShape leaves the body alone when the named key is absent", () => {
  const req = { body: { user_id: "u1" } };
  wireShape(build("legacy"), { body: "spot" })(req, fakeRes().res, () => {});
  assert.deepEqual(req.body, { user_id: "u1" });
});

test("wireShape skips the body entirely when the feature has no writes", () => {
  const req = { body: { type: "Gold" } };
  wireShape(build("legacy"), { body: false })(req, fakeRes().res, () => {});
  assert.deepEqual(req.body, { type: "Gold" });
});

// What keeps the two hazards above theoretical: no real name map may send two
// fields to one legacy name, and no legacy name may also be a new name. The
// first loses a field outright; the second breaks the round trip and the
// double-apply guarantee at once.
test("no real wire adapter can collide or break its own round trip", () => {
  const features = path.resolve(import.meta.dirname, "../../features");
  const maps = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "wire.ts") {
        const src = fs.readFileSync(full, "utf8");
        const m = src.match(/names:\s*\{([^}]*)\}/s);
        if (m) maps.push([path.relative(features, full), [...m[1].matchAll(/(\w+)\s*:\s*["'](\w+)["']/g)]]);
      }
    }
  };
  walk(features);

  // The floor tracks how many rename-map adapters EXIST, and it shrinks as
  // features convert: media's adapter was deleted 2026-08-27 (first converted
  // feature, 3 -> 2), spots' the same day (2 -> 1, its unconditional remnant
  // lives in features/spots/legacy-shape.ts and carries no env switch). Lower
  // this again when products converts - and if it ever reads low WITHOUT a
  // deletion in the same change, the scan broke, which is what the floor is
  // for.
  assert.ok(maps.length >= 1, `only ${maps.length} rename map(s) found - the scan missed some`);
  for (const [where, pairs] of maps) {
    const news = pairs.map((p) => p[1]);
    const legacies = pairs.map((p) => p[2]);
    assert.equal(new Set(legacies).size, legacies.length, `${where}: two fields rename to one legacy name`);
    const overlap = news.filter((n) => legacies.includes(n));
    assert.deepEqual(overlap, [], `${where}: ${overlap.join(", ")} is both a new name and a legacy one`);
  }
});
