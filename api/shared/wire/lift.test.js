// The lift adapter, which three features now share.
//
// refiners, carriers and addresses each carried their own copy of this - forty
// seven lines, three times, identical between refiners and carriers character
// for character. These tests exist because extracting it made one behaviour
// serve three wire switches, so a mistake here is a mistake in three places at
// once.
//
// The cases are the ones that differ between a careless implementation and a
// correct one: a missing nested object, a partial one, a row already in the new
// shape, and a row with nothing to lift. Getting any of those wrong turns a
// legitimate row into nulls, or attaches an object of undefineds that reads as
// a deliberate blanking.
import test from "node:test";
import assert from "node:assert/strict";
import { makeLiftAdapter } from "#shared/wire/lift.ts";

// A fixed env name that is never set, so activeShape is always "legacy" and
// toLegacy/fromLegacy are exercised directly rather than through the switch.
const org = makeLiftAdapter({
  env: "LIFT_TEST_WIRE_UNSET",
  key: "organization",
  fields: { name: "name", email: "email", phone: "phone", enabled: "is_active" },
});

test("an unset switch defaults to legacy, like every other adapter", () => {
  assert.equal(org.activeShape, "legacy");
});

test("flattening lifts the nested fields to the top level", () => {
  assert.deepEqual(
    org.toLegacy({ id: "1", organization: { name: "Elemetal", email: "e@x", phone: "5", enabled: true } }),
    { id: "1", name: "Elemetal", email: "e@x", phone: "5", is_active: true }
  );
});

// The legacy shape always carried these keys, so a frontend destructuring them
// wants null rather than undefined. A partial nested object must still produce
// every key.
test("fields missing from the nested object become null, not undefined", () => {
  const out = org.toLegacy({ id: "2", organization: { name: "Partial" } });
  assert.deepEqual(out, { id: "2", name: "Partial", email: null, phone: null, is_active: null });
  for (const k of ["email", "phone", "is_active"]) {
    assert.ok(k in out, `${k} was dropped rather than nulled`);
  }
});

test("a null or absent nested object gives nulls rather than throwing", () => {
  assert.deepEqual(org.toLegacy({ id: "3", organization: null }), {
    id: "3", name: null, email: null, phone: null, is_active: null,
  });
  assert.deepEqual(org.toLegacy({ id: "4" }), {
    id: "4", name: null, email: null, phone: null, is_active: null,
  });
});

test("fields the adapter does not know about pass through untouched", () => {
  const out = org.toLegacy({ id: "5", extra: "kept", organization: { name: "X" } });
  assert.equal(out.extra, "kept", "an undeclared field was dropped - the adapter must not filter");
});

test("non-objects are returned as they are", () => {
  for (const value of [null, undefined, "a string", 42, true]) {
    assert.equal(org.toLegacy(value), value);
  }
});

test("a list is mapped element by element", () => {
  assert.deepEqual(
    org.toLegacy([{ organization: { name: "A" } }, { organization: { name: "B" } }]),
    [
      { name: "A", email: null, phone: null, is_active: null },
      { name: "B", email: null, phone: null, is_active: null },
    ]
  );
});

test("nesting is the inverse of flattening", () => {
  const flat = { id: "1", name: "Elemetal", email: "e@x", phone: "5", is_active: true };
  assert.deepEqual(org.fromLegacy(flat), {
    id: "1",
    organization: { name: "Elemetal", email: "e@x", phone: "5", enabled: true },
  });
});

// A request already in the new shape must not be nested twice. Doing so would
// bury the organization inside another organization.
test("a row already nested passes through", () => {
  const already = { id: "1", organization: { name: "already" } };
  assert.deepEqual(org.fromLegacy(already), already);
});

// THE CASE THAT MATTERS MOST. A body carrying none of the flat fields is not a
// legacy body - it is a request about something else entirely. Attaching
// { name: undefined, email: undefined, ... } would read downstream as a
// deliberate instruction to blank them.
test("a row with nothing to lift is left alone, not given an empty nested object", () => {
  const unrelated = { id: "1", unrelated: "value" };
  const out = org.fromLegacy(unrelated);
  assert.deepEqual(out, unrelated);
  assert.ok(!("organization" in out), "an empty organization was attached to a row that had none");
});

test("a single flat field is enough to make it a legacy body", () => {
  assert.deepEqual(org.fromLegacy({ id: "1", is_active: false }), {
    id: "1",
    organization: { name: undefined, email: undefined, phone: undefined, enabled: false },
  });
});

// The same helper with entirely different nouns, which is the point of it.
test("the addresses lift works the same way with different names", () => {
  const addr = makeLiftAdapter({
    env: "LIFT_TEST_WIRE_UNSET",
    key: "user_address",
    fields: { user_id: "user_id", label: "name", default_shipping: "is_default" },
  });
  assert.deepEqual(
    addr.toLegacy({ id: "1", line_1: "x", user_address: { user_id: "u", label: "Home", default_shipping: true } }),
    { id: "1", line_1: "x", user_id: "u", name: "Home", is_default: true }
  );
  assert.deepEqual(addr.fromLegacy({ id: "1", user_id: "u", name: "Home", is_default: true }), {
    id: "1",
    user_address: { user_id: "u", label: "Home", default_shipping: true },
  });
});
