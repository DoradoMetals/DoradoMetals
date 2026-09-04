// Guards against browser API calls made from onSuccess/onSettled rather than mutationFn — if these fail, the operation has already succeeded and nothing retries or tells anyone.
// Real incident: /emails/purchase_order_offer_accepted silently never sent because of exactly this. Only the two order emails are allowed this pattern (D31); a third fails here.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// THE CLIENT PACKAGE IS PART OF THE FRONTEND for this question - the same
// reasoning frontend-routes.test.ts already applies. The order/checkout/
// product hooks moved out of `frontend/features/**` into `@dorado/client`,
// and a scan that only walked one of the two would read those moves as calls
// disappearing rather than calls that still need the same guard. Scanning it
// here is what caught `packages/client/src/checkout/queries.ts`'s
// `fetchCheckoutItems` - a dead one-shot fetcher, left from before ruling 63
// removed the sign-in basket merge it existed for, nothing ever called it -
// sitting where the nearest-preceding-keyword heuristic below misattributed
// it to an unrelated `onSuccess` closed above it in the same file. Deleted at
// the source rather than added here: an ALLOWED entry excuses a real call,
// and this one had no caller to excuse.
const ROOTS = [
  path.resolve(process.cwd(), "..", "frontend"),
  path.resolve(process.cwd(), "..", "packages", "client", "src"),
];

// Nearest preceding react-query key is the call's context — a fixed-size window misattributes a call that spills into the next handler.
// `request` is useApiQuery's own fetch key (its queryFn).
const CONTEXT = /\b(mutationFn|queryFn|request|onSuccess|onSettled|onError|onMutate)\s*:/g;

// Test files call `apiRequest` directly to exercise the primitive itself
// (fetch.ts's URL/body/error handling, or a hook's request body) - that IS the
// thing under test, not a browser-triggered effect. Walking them in produced
// five matches, every one a raw call inside a `test()` body in
// packages/client/src/tests/{http,bodies}.test.ts, none of them a mutation or
// a component. Excluded the same way ruling 52's lint-one-catch and
// lint-domain-errors exclude test files from a behavioural-pattern scan.
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".") ||
      e.name === "tests"
    ) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

// Committed rather than derived — a list read out of the file it checks would always agree with itself.
const ALLOWED: string[] = [
  // The sitemap's catalogue read used to sit here. It is GONE, not excused:
  // the sitemap calls @dorado/client's fetchProducts now, so no `apiRequest`
  // remains in frontend/ for this apiRequest-shaped scan to match.
  // The basket-hydration entry that sat here is GONE, not excused: the call
  // moved into @dorado/client as `fetchCheckoutItems`, so no `apiRequest`
  // remains in frontend/ for it to match. That function is ITSELF gone now
  // (see the ROOTS comment) - it was never called anywhere, and the reason it
  // existed (a sign-in basket merge) was removed by ruling 63 before this
  // scan ever grew a second root.
  //
  // `fetchProducts` (packages/client/src/products/queries.ts) is what remains
  // of that first entry: a plain exported function, not a hook - it IS the
  // queryFn `useProducts` calls, and it is ALSO called directly by
  // `frontend/app/sitemap.ts`, at request time, on the Next.js server,
  // outside react-query and outside the browser entirely. Same call, same
  // justification the first bullet above already gave it; it only reappears
  // as a finding now that packages/client/src is in scope to match it.
  "(top level) GET /products",
];

test("only the two order emails are triggered after an operation already succeeded", () => {
  const found: string[] = [];
  const all: string[] = [];
  let total = 0;

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = fs.readFileSync(file, "utf8");
      // Explicit tuple type — a bare array literal widens to (string | number)[][], breaking the `at < m.index` comparison below.
      const keys: [number, string][] = [...src.matchAll(CONTEXT)].map((m) => [m.index, m[1]]);
      // Matches both quote styles for the verb AND the url - frontend/ writes
      // single quotes, packages/client/src writes double; a template-literal
      // URL (e.g. `/orders/${id}`) is the backtick branch.
      for (const m of src.matchAll(
        /apiRequest(?:<[^>]*>)?\(\s*['"](GET|POST|PUT|DELETE|PATCH)['"],\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)/g
      )) {
        total += 1;
        const prior = keys.filter(([at]) => at < m.index);
        const ctx = prior.length ? prior[prior.length - 1][1] : "(top level)";
        const entry = `${ctx} ${m[1]} ${m[2] ?? m[3] ?? m[4]}`;
        all.push(entry);
        if (ctx === "mutationFn" || ctx === "queryFn" || ctx === "request") continue;
        found.push(entry);
      }
    }
  }

  // A KNOWN-PRESENT CONTROL, not just a bigger floor. A floor alone can pass
  // while a whole root silently stops being walked - audit:query-paths hit
  // exactly this (dropping three of eighteen schemas still left 113 literals
  // and reported clean). `GET /spots` inside a queryFn exists only in
  // packages/client/src/spots/queries.ts, so its presence in `all` is proof
  // the second root was actually reached and matched, not merely appended to
  // the array above.
  assert.ok(
    all.includes("queryFn GET /spots"),
    "packages/client/src was not scanned - the known /spots queryFn call is missing"
  );

  // THE FLOOR SHRINKS AS SURFACES CONVERT, and that is not the scan breaking.
  // Recomputed honestly for both roots, test files excluded, after
  // packages/client/src joined the scan and fetchCheckoutItems's dead call
  // was deleted: 105 today (14 frontend + 91 client). Set comfortably below
  // that so a small conversion does not chase this number every wave, but
  // still far above zero.
  assert.ok(
    total >= 95,
    `only ${total} apiRequest call(s) found - the scan has stopped matching, ` +
      "and a check that reads nothing accepts everything"
  );

  assert.deepEqual(
    found.sort(),
    [...ALLOWED].sort(),
    "an API call runs after its operation has already succeeded. If it fails " +
      "the user still sees success, nothing retries, and nobody is told - " +
      "which is exactly how the offer-accepted email went missing. Either move " +
      "it into the mutationFn, send it from the server, or add it here on purpose."
  );
  console.log(`      ${total} apiRequest call(s) scanned, ${found.length} outside a mutationFn`);
});
