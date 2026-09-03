// Renders the phone numbers that print on shipping documents (the business's own number, the from/to on a label) — what it does with bad input ends up on paper a courier reads.
// Partial input is supported, not an edge case — it runs on every keystroke, so three digits gives "(555" rather than nothing.
import { test } from "vitest";
import assert from "node:assert/strict";
import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";

test("absent input gives an empty string, never the word undefined", () => {
  for (const v of [undefined, null, ""]) {
    assert.equal(formatPhoneNumber(v), "");
  }
});

test("a complete ten-digit number formats fully", () => {
  assert.equal(formatPhoneNumber("5551234567"), "(555) 123-4567");
});

test("it builds up as it is typed", () => {
  assert.equal(formatPhoneNumber("5"), "(5");
  assert.equal(formatPhoneNumber("555"), "(555");
  assert.equal(formatPhoneNumber("5551"), "(555) 1");
  assert.equal(formatPhoneNumber("555123"), "(555) 123");
  assert.equal(formatPhoneNumber("5551234"), "(555) 123-4");
});

test("anything that is not a digit is stripped, in any arrangement", () => {
  for (const v of [
    "(555) 123-4567", "555.123.4567", "555 123 4567",
    "+1 (555) 123-4567", "555-123-4567 ext", "  5551234567  ",
  ]) {
    assert.equal(formatPhoneNumber(v), "(555) 123-4567", `for ${JSON.stringify(v)}`);
  }
});

// A leading 1 is the US country code and is dropped. Worth pinning because the
// rule is unconditional: it is applied to the digit string, not to a string
// known to be eleven digits long.
test("a leading country code is dropped", () => {
  assert.equal(formatPhoneNumber("15551234567"), "(555) 123-4567");
  assert.equal(formatPhoneNumber("+1-555-123-4567"), "(555) 123-4567");
});

// The consequence of that rule on SHORT input, stated so a future reader knows
// it was seen rather than missed. US area codes and exchange codes cannot begin
// with 1, so a real number never takes this path.
test("the leading-1 rule also applies to short input", () => {
  assert.equal(formatPhoneNumber("1555"), "(555");
});

// More than ten digits are truncated rather than rejected: slice(6, 10) simply
// stops. A number with too many digits prints as a plausible wrong number, so
// this is pinned deliberately.
test("digits past the tenth are dropped, not rendered", () => {
  assert.equal(formatPhoneNumber("55512345678901"), "(555) 123-4567");
  assert.equal(formatPhoneNumber("25551234567"), "(255) 512-3456");
});
