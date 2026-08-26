// The rate resolution exists TWICE - once here and once in the frontend at
// frontend/features/rates/utils/resolveRate.ts - and its own comment says
// "mirrored 1:1 ... keep the two in sync". Nothing checked that.
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

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const API = path.join(ROOT, "api/features/rates/utils/resolveRate.ts");
const WEB = path.join(ROOT, "frontend/features/rates/utils/resolveRate.ts");

// The three the two copies share. formatRate is frontend-only and is display,
// not arithmetic, so it is deliberately not required here.
const SHARED = ["getRateBand", "getRatePct", "sumContentByMetal"];

function extract(file, name) {
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
const ALLOWED_DIFFERENCES = [
  [/\(rates \?\? \[\]\)/g, "rates"],
  [/items \?\? \[\]/g, "items"],
];

const normalise = (s) => {
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

test("both copies of the rate resolution still exist where the comment says", () => {
  assert.ok(fs.existsSync(API), `${API} is gone`);
  assert.ok(fs.existsSync(WEB), `${WEB} is gone - the mirror comment is stale`);
});

for (const name of SHARED) {
  test(`${name} has not drifted between the API and the frontend`, () => {
    const a = normalise(extract(API, name));
    const w = normalise(extract(WEB, name));
    assert.equal(
      a,
      w,
      `${name} differs between api/ and frontend/. The two must agree: one ` +
        `quotes the customer a payout rate and the other pays it.`
    );
  });
}

// The guard above compares source, so it is worth proving it is reading
// something rather than comparing two empty strings.
test("the comparison is reading real function bodies, not empty strings", () => {
  for (const name of SHARED) {
    const body = normalise(extract(API, name));
    assert.ok(body.length > 80, `${name} extracted only ${body.length} chars`);
    assert.match(body, /return/);
  }
});

// The allowance above is only safe while the API really is the defensive one.
// If someone removes these guards, the two files start agreeing for the wrong
// reason and the API starts throwing on a null list off the wire.
test("the API still tolerates a null list, which is why the difference is allowed", () => {
  const src = fs.readFileSync(API, "utf8");
  assert.match(src, /\(rates \?\? \[\]\)/, "the API's null-rates guard is gone");
  assert.match(src, /items \?\? \[\]/, "the API's null-items guard is gone");
});
