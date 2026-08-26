// EVERY API CALL THE FRONTEND MAKES NAMES A ROUTE THE API HAS.
//
// The frontend posted to /purchase_orders/purchase_order_offer_accepted. That
// route exists - as /emails/purchase_order_offer_accepted. Wrong feature
// prefix, so the request 404s and the "your offer was accepted" email is never
// sent. Sixty lines above it in the same file,
// /emails/purchase_order_created is called correctly.
//
// It fails quietly for two reasons worth naming. The call sits in a mutation's
// onSuccess, so the offer IS accepted and the customer sees success; only the
// follow-up dies. And apiRequest throws the response body, which in onSuccess
// becomes an unhandled rejection rather than a failed mutation.
//
// THIS IS THE OTHER HALF OF admin-mutation-urls.test.js. That one asks whether
// a call sends a key its route reads; this asks whether the route exists at
// all. The pool-remediation bug had a real URL and the wrong body; this one has
// the right body and no URL. Neither check sees the other's case.
//
// Template-literal paths cannot be resolved statically and are skipped rather
// than guessed at - the count is printed so the skip cannot grow unnoticed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { allRoutes } from "../../scripts/route-guards.mjs";

const FRONTEND = path.resolve(process.cwd(), "..", "frontend");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

// The three shapes this codebase uses to name an endpoint.
const PATTERNS = [
  /apiRequest\(\s*'(GET|POST|PUT|DELETE)',\s*'([^']+)'/g,
  /url:\s*'([^']+)',\s*\n?\s*method:\s*'(GET|POST|PUT|DELETE)'/g,
  /method:\s*'(GET|POST|PUT|DELETE)',\s*\n?\s*url:\s*'([^']+)'/g,
];

const collect = () => {
  const calls = [];
  let skipped = 0;
  for (const file of walk(FRONTEND)) {
    const src = fs.readFileSync(file, "utf8");
    for (const [i, re] of PATTERNS.entries()) {
      for (const m of src.matchAll(re)) {
        const [verb, url] = i === 1 ? [m[2], m[1]] : [m[1], m[2]];
        if (url.includes("${")) { skipped += 1; continue; }
        calls.push({ file: path.relative(FRONTEND, file), verb, url });
      }
    }
    // A template-literal endpoint is a skip, not a pass.
    for (const m of src.matchAll(/apiRequest\(\s*'(?:GET|POST|PUT|DELETE)',\s*`/g)) skipped += 1;
  }
  return { calls, skipped };
};

// The frontend writes paths without the /api the server mounts them under.
const toRoute = (url) => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);

test("every frontend API call names a route the API actually has", () => {
  const known = new Set(allRoutes.filter((r) => r.url).map((r) => `${r.verb} ${r.url}`));
  assert.ok(known.size > 100, `only ${known.size} routes known - the route walk is wrong`);

  const { calls, skipped } = collect();
  assert.ok(
    calls.length >= 40,
    `only ${calls.length} frontend call(s) found - the patterns have stopped ` +
      "matching, and a check that reads nothing accepts everything"
  );

  const missing = calls
    .filter((c) => !known.has(`${c.verb} ${toRoute(c.url)}`))
    .map((c) => `${c.verb} ${toRoute(c.url)}  (${c.file})`);

  assert.deepEqual(
    missing,
    [],
    "the frontend calls a route the API does not have - it 404s, and if the " +
      "call sits in an onSuccess the user sees success anyway"
  );
  console.log(
    `      ${calls.length} frontend call(s) checked against ${known.size} routes` +
      `, ${skipped} template path(s) skipped`
  );
});
