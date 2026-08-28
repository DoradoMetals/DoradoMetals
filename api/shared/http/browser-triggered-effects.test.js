// WHICH API CALLS THE BROWSER MAKES *AFTER* AN OPERATION HAS ALREADY SUCCEEDED.
//
// A call inside a mutationFn is the mutation: if it fails, the mutation fails
// and the user is told. A call inside onSuccess is a follow-up: the operation
// has already succeeded, the UI has already said so, and apiRequest's throw
// becomes an unhandled rejection. Nothing retries and nobody is told.
//
// That is not hypothetical. /emails/purchase_order_offer_accepted was posted to
// the wrong path for as long as it has existed, and the only reason nobody
// noticed is that it lives here: every customer accepted their offer
// successfully and simply never got the email.
//
// Exactly two calls were in that position and BOTH WERE THE ORDER EMAILS.
// Nothing server-side sends either one - sendCreatedEmail and sendPricedEmail
// (the accepted mail, renamed when the offers went) are reachable only
// through their HTTP routes. So the customer order emails depend on the
// browser making a second request after the order is already placed.
//
// This file does not object to that; it is a design question and it is D31.
// What it does is refuse to let the pattern spread quietly: a THIRD such call,
// or either of these two moving, fails here and has to be looked at.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FRONTEND = path.resolve(process.cwd(), "..", "frontend");

// The react-query keys that own a block of code in this codebase. The nearest
// one PRECEDING a call is the context that call runs in - a fixed-size window
// after the keyword spills into the next handler and misattributes it, which
// the first version of this scan did.
// `request` is useApiQuery's custom fetch key - the queryFn of this
// codebase's own query wrapper, added when the widened URL regex surfaced
// the sites defined through it.
const CONTEXT = /\b(mutationFn|queryFn|request|onSuccess|onSettled|onError|onMutate)\s*:/g;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

// Committed rather than derived: a list read out of the file it checks would
// shrink as the code changed and always agree with itself.
const ALLOWED = [
  "onSuccess POST /emails/purchase_order_created",
  // READS in plain functions, surfaced when the URL regex learned template
  // literals and `request:` contexts. A failed read loses no user action:
  // the sitemap generator runs at build/request time on the server, and the
  // two cart hydrations run post-login with their own catch (the store just
  // keeps the local copy). None is an effect after a success.
  "(top level) GET /products/get_all_products",
  "(top level) GET /cart/get_cart",
  "(top level) GET /cart/get_sell_cart",
  // The offer-accepted entry left with 086: the hook that made the call was
  // deleted along with the rest of the offer flow, so there is nothing
  // browser-triggered left to allow.
];

test("only the two order emails are triggered after an operation already succeeded", () => {
  const found = [];
  let total = 0;

  for (const file of walk(FRONTEND)) {
    const src = fs.readFileSync(file, "utf8");
    const keys = [...src.matchAll(CONTEXT)].map((m) => [m.index, m[1]]);
    // Both quote styles: the D87 per-resource hooks build URLs with template
    // literals (`/orders/${id}`), which the single-quote-only version of this
    // regex could not see - the scan floor caught exactly that.
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
