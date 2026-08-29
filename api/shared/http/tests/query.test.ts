// oneString is what stands between `req.query.x` and a repo. Express really
// does hand over an array for `?id=a&id=b` and an object for `?id[k]=v`, from
// any caller who feels like sending one, and pg receiving either where a uuid
// was expected is a 500 on malformed input rather than a clean refusal.
//
// The deliberate part is that it does NOT coerce. An array is not joined into
// "a,b", because that would invent an id nobody sent. That is the behaviour a
// future "helpful" change would break, so it is pinned from the value side.
import test from "node:test";
import assert from "node:assert/strict";
import { oneString } from "#shared/http/query.ts";

test("a string passes through unchanged", () => {
  assert.equal(oneString("abc"), "abc");
  assert.equal(oneString("a b"), "a b");
});

// Subtle and worth stating: "" IS a string, so it survives. Callers testing
// truthiness treat it as missing; callers testing `=== undefined` do not. The
// function's job is narrowing the TYPE, not deciding what empty means.
test("an empty string is still a string and survives", () => {
  assert.equal(oneString(""), "");
});

test("an array becomes undefined and is never joined", () => {
  assert.equal(oneString(["a", "b"]), undefined);
  assert.equal(oneString(["a"]), undefined);
  assert.equal(oneString([]), undefined);
});

test("an object becomes undefined", () => {
  assert.equal(oneString({ k: "v" }), undefined);
  assert.equal(oneString(Object.create(null)), undefined);
});

test("everything else that can arrive becomes undefined", () => {
  for (const v of [undefined, null, 0, 1, true, false, NaN, Symbol("s"), 10n]) {
    assert.equal(oneString(v), undefined, `expected undefined for ${String(v)}`);
  }
});

// A String object is not a string primitive, and pg would receive an object.
test("a boxed String is not treated as a string", () => {
  assert.equal(oneString(new String("abc")), undefined);
});
