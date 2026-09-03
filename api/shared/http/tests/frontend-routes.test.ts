// Every API call the frontend makes names a route the API has. Found: the frontend posted to the wrong feature prefix for an offer-accepted email, so it 404s silently — the call sits in a mutation's onSuccess (the customer sees success; only the follow-up dies) and apiRequest throws the response body, which becomes an unhandled rejection there.
// The other half of admin-mutation-urls.test.ts — that one asks whether a call sends the key its route reads; this asks whether the route exists at all. Neither check sees the other's case.
// Template-literal paths can't be resolved statically and are skipped, not guessed at — the skip count is printed so it can't grow unnoticed.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { allRoutes } from "../../../scripts/route-guards.ts";

const FRONTEND = path.resolve(process.cwd(), "..", "frontend");

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

// The three shapes this codebase uses to name an endpoint — most PATCH calls carry the order id as a template literal and land in the skip count, but a static one must not be invisible.
const PATTERNS = [
  /apiRequest\(\s*'(GET|POST|PUT|PATCH|DELETE)',\s*'([^']+)'/g,
  /url:\s*'([^']+)',\s*\n?\s*method:\s*'(GET|POST|PUT|PATCH|DELETE)'/g,
  /method:\s*'(GET|POST|PUT|PATCH|DELETE)',\s*\n?\s*url:\s*'([^']+)'/g,
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
    for (const m of src.matchAll(/apiRequest\(\s*'(?:GET|POST|PUT|PATCH|DELETE)',\s*`/g)) skipped += 1;
  }
  return { calls, skipped };
};

// Calls KNOWN to hit nothing on purpose, each needing a reason — a 404 here defaults to a defect, which is the whole point. Pinned from both sides: an unlisted 404 fails, and a listed call that starts resolving also fails, so this can't quietly become a stale suppression list.
// Empty since 086 — the one entry (the offer-accepted email) said to delete itself when its step went; the step went.
const DELIBERATE_404: Record<string, string | undefined> = {};

// The frontend writes paths without the /api the server mounts them under.
const toRoute = (url: string) => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);

test("every frontend API call names a route the API actually has", () => {
  const known = new Set(allRoutes.filter((r) => r.url).map((r) => `${r.verb} ${r.url}`));
  assert.ok(known.size > 100, `only ${known.size} routes known - the route walk is wrong`);

  const { calls, skipped } = collect();
  // Floor was 40 before the order-mutation consolidation turned ~20 single-field POSTs into PATCH documents whose paths carry the order id (and land in the skip count instead).
  assert.ok(
    calls.length >= 30,
    `only ${calls.length} frontend call(s) found - the patterns have stopped ` +
      "matching, and a check that reads nothing accepts everything"
  );

  const unresolved = calls.filter((c) => !known.has(`${c.verb} ${toRoute(c.url)}`));
  const missing = unresolved
    .filter((c) => !DELIBERATE_404[`${c.verb} ${toRoute(c.url)}`])
    .map((c) => `${c.verb} ${toRoute(c.url)}  (${c.file})`);

  assert.deepEqual(
    missing,
    [],
    "the frontend calls a route the API does not have - it 404s, and if the " +
      "call sits in an onSuccess the user sees success anyway"
  );

  // The other direction of the pin. An entry that now resolves is stale, and a
  // stale entry is how a real 404 gets waved through by a name that used to
  // mean something else.
  const stale = Object.keys(DELIBERATE_404).filter(
    (k) => !unresolved.some((c) => `${c.verb} ${toRoute(c.url)}` === k)
  );
  assert.deepEqual(
    stale,
    [],
    "a call listed as a deliberate 404 now resolves - remove it from DELIBERATE_404"
  );
  console.log(
    `      ${calls.length} frontend call(s) checked against ${known.size} routes` +
      `, ${skipped} template path(s) skipped` +
      `, ${Object.keys(DELIBERATE_404).length} deliberate 404(s)`
  );
});
