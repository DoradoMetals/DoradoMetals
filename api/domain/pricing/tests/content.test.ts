// The one definition of fine metal content.
import { test } from "vitest";
import assert from "node:assert/strict";
import { fineContent } from "#domain/pricing/content.ts";

// The zeroes are preserved behaviour: convertTroyOz answers 0 for an
// unparseable weight or unit, and null multiplies as 0.
test("content is weight in troy ounces times purity, and unmeasurable is null", () => {
  assert.equal(fineContent(8, "t oz", 0.5), 4);
  assert.equal(fineContent(160, "dwt", 0.5), 4);
  assert.equal(fineContent(8, "t oz", undefined), null);
  assert.equal(fineContent(undefined, "t oz", 0.5), 0);
  assert.equal(fineContent(null, "t oz", 0.5), 0);
  assert.equal(fineContent(8, "t oz", null), 0);
  assert.equal(fineContent(8, "not-a-unit", 0.5), 0);
});
