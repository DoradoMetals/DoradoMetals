// Guards against browser API calls made from onSuccess/onSettled rather than mutationFn — if these fail, the operation has already succeeded and nothing retries or tells anyone.
// Real incident: /emails/purchase_order_offer_accepted silently never sent because of exactly this. Only the two order emails are allowed this pattern (D31); a third fails here.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FRONTEND = path.resolve(process.cwd(), "..", "frontend");

// Nearest preceding react-query key is the call's context — a fixed-size window misattributes a call that spills into the next handler.
// `request` is useApiQuery's own fetch key (its queryFn).
const CONTEXT = /\b(mutationFn|queryFn|request|onSuccess|onSettled|onError|onMutate)\s*:/g;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

// Committed rather than derived — a list read out of the file it checks would always agree with itself.
const ALLOWED = [
  // These are reads, not post-success effects — a failed read loses no user action (sitemap runs server-side; basket hydration runs post-login with its own catch, keeping the local copy).
  "(top level) GET /products/get_all_products",
  // The basket-hydration entry that sat here is GONE, not excused: the call
  // moved into @dorado/client as `fetchCheckoutItems`, so no `apiRequest`
  // remains in frontend/ for it to match. This scan is apiRequest-shaped and
  // frontend-scoped on purpose - `lint:client-boundary` is what now refuses a
  // new one, and the client package's own calls all sit inside a queryFn or a
  // mutationFn by construction.
];

test("only the two order emails are triggered after an operation already succeeded", () => {
  const found = [];
  let total = 0;

  for (const file of walk(FRONTEND)) {
    const src = fs.readFileSync(file, "utf8");
    // Explicit tuple type — a bare array literal widens to (string | number)[][], breaking the `at < m.index` comparison below.
    const keys: [number, string][] = [...src.matchAll(CONTEXT)].map((m) => [m.index, m[1]]);
    // Matches both quote styles — a template-literal URL (e.g. `/orders/${id}`) wouldn't match a single-quote-only regex.
    for (const m of src.matchAll(/apiRequest(?:<[^>]*>)?\(\s*'(GET|POST|PUT|DELETE|PATCH)',\s*(?:'([^']+)'|`([^`]+)`)/g)) {
      total += 1;
      const prior = keys.filter(([at]) => at < m.index);
      const ctx = prior.length ? prior[prior.length - 1][1] : "(top level)";
      if (ctx === "mutationFn" || ctx === "queryFn" || ctx === "request") continue;
      found.push(`${ctx} ${m[1]} ${m[2] ?? m[3]}`);
    }
  }

  assert.ok(
    total >= 15,
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
