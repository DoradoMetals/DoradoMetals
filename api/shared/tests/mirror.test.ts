// Logic that exists in BOTH repos, held in step.
//
// The rate resolution says so itself - "mirrored 1:1 ... keep the two in sync"
// - and nothing checked it. Weight conversion says nothing at all and is
// mirrored just the same, which is worse: there was no comment to go stale.
//
// It decides the payout premium a customer is quoted, tiered by how much of a
// metal is in the order. If the two copies drift, the frontend shows one rate
// and the API pays another, and both are self-consistent so neither test suite
// notices. This compares the shared functions and fails if they diverge.
//
// Formatting is not the point: semicolons, quote style and type annotations
// differ between the two files and always have. What must match is the
// sequence of statements.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
// Every piece of logic that exists in both repos. Each pair is money: one
// side quotes a customer a number and the other side pays it.
const PAIRS = [
  {
    what: "the rate resolution",
    api: "api/domain/rates/utils/resolveRate.ts",
    web: "frontend/features/rates/utils/resolveRate.ts",
    // formatRate is frontend-only and is display, not arithmetic.
    shared: ["getRateBand", "getRatePct", "sumContentByMetal"],
  },
  {
    what: "weight conversion",
    api: "api/shared/utils/convertWeights.ts",
    web: "frontend/shared/utils/convertWeights.ts",
    // convertToPounds is frontend-only - it sizes a parcel, not a payout.
    // A THIRD copy exists as the SQL function metals.convert_to_troy_oz;
    // api/shared/utils/convertWeights.test.js compares against that one.
    shared: ["convertTroyOz"],
  },
];

function extract(file: string, name: string): string {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} is missing from ${path.relative(ROOT, file)}`);
  // Walk to the matching brace of the function body.
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(from, i + 1);
}

// ONE difference is real, deliberate, and allowed: the API tolerates a null
// list where the frontend does not - `(rates ?? [])` and `items ?? []`. The
// API takes its input off the wire and the frontend's is typed, so the two
// are right to differ. It is normalised away HERE, by name, rather than by a
// loose comparison that would also hide a difference that matters. The test
// below then pins the guards themselves, so dropping the API's null tolerance
// fails rather than quietly making the two files "agree".
// TUPLES, DECLARED. As a bare literal this widens to `(RegExp | string)[][]`,
// so `out.replace(re, to)` matches no overload - both halves arrive as
// `string | RegExp`. Same shape as lint-migrations' DESTRUCTIVE list; the
// pattern is invisible until something typechecks the file.
const ALLOWED_DIFFERENCES: readonly (readonly [RegExp | string, string])[] = [
  [/\(rates \?\? \[\]\)/g, "rates"],
  [/items \?\? \[\]/g, "items"],
];

const normalise = (s: string): string => {
  let out = s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/"/g, "'")
    .replace(/;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of ALLOWED_DIFFERENCES) out = out.replace(re, to);
  return out;
};

for (const pair of PAIRS) {
  const API = path.join(ROOT, pair.api);
  const WEB = path.join(ROOT, pair.web);

  test(`both copies of ${pair.what} are still where they are expected`, () => {
    assert.ok(fs.existsSync(API), `${pair.api} is gone`);
    assert.ok(fs.existsSync(WEB), `${pair.web} is gone`);
  });

  for (const name of pair.shared) {
    test(`${name} has not drifted between the API and the frontend`, () => {
      const a = normalise(extract(API, name));
      const w = normalise(extract(WEB, name));
      assert.equal(
        a,
        w,
        `${name} differs between api/ and frontend/. The two must agree: one ` +
          `quotes the customer a number and the other pays it.`
      );
    });
  }
}

// The guard above compares source, so it is worth proving it is reading
// something rather than comparing two empty strings.
test("the comparison is reading real function bodies, not empty strings", () => {
  let checked = 0;
  for (const pair of PAIRS) {
    for (const name of pair.shared) {
      const body = normalise(extract(path.join(ROOT, pair.api), name));
      assert.ok(body.length > 80, `${name} extracted only ${body.length} chars`);
      assert.match(body, /return/);
      checked += 1;
    }
  }
  assert.equal(checked, 4, "expected four shared functions across the two pairs");
});

// The allowance above is only safe while the API really is the defensive one.
// If someone removes these guards, the two files start agreeing for the wrong
// reason and the API starts throwing on a null list off the wire.
test("the API still tolerates a null list, which is why the difference is allowed", () => {
  const src = fs.readFileSync(path.join(ROOT, PAIRS[0].api), "utf8");
  assert.match(src, /\(rates \?\? \[\]\)/, "the API's null-rates guard is gone");
  assert.match(src, /items \?\? \[\]/, "the API's null-items guard is gone");
});
