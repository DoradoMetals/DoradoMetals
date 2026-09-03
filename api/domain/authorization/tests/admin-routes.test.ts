// Every admin route refuses a customer and an anonymous caller. Written after a real bug: get_payout_details (returns plaintext bank numbers) had a test that drove it AS an admin and checked the response shape — nothing checked the guard.
// The route list isn't hand-maintained — scripts/route-guards.ts derives it from app.ts's actual mounts (a folder name doesn't predict the mount prefix), so a new route is covered automatically.
// DELETE /api/purchase_orders/purge_cancelled is excluded by name — it's `DELETE FROM exchange.purchase_orders` with no id, so a test proving its guard is missing would BE the delete. Every other request carries an empty body as a mitigation, not a guarantee.
// No response body is ever printed or interpolated, on any path — several of these routes return payouts.
// The sweep alone can't catch a DELETED guard (the route just stops being admin and stops being tested) — admin-routes.json is a committed inventory that must be updated by hand, so removing a guard shows as a diff instead of silently narrowing coverage.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { adminRoutes, allRoutes } from "../../../scripts/route-guards.ts";
import type { Route } from "../../../scripts/route-guards.ts";
import { readFileSync } from "node:fs";

// The reviewed list, as "<VERB> <url>" strings — compared against `current`, also strings.
const INVENTORY: string[] = JSON.parse(
  readFileSync(new URL("../admin-routes.json", import.meta.url), "utf8")
);

await mockSessions();
const { default: app } = await import("#app");

const EXCLUDED = new Set(["/api/purchase_orders/purge_cancelled"]);

// Narrows `url` too — an unresolved mount has no URL to drive, and would otherwise request the string "null".
const routes = adminRoutes.filter(
  (r): r is Route & { url: string } => r.url !== null && !EXCLUDED.has(r.url)
);

type UserRow = { id: string; name: string | null; email: string | null };

let customer: UserRow;

beforeAll(async () => {
  customer = TEST_CUSTOMER;

  // Floor guards against the scanner silently resolving nothing (a still-green false negative). Was 70; the order-mutation consolidation folded 24 admin POSTs into 2 PATCH endpoints, so 55 remain — floor sits just under that.
  assert.ok(
    routes.length >= 50,
    `only ${routes.length} admin routes resolved - the scanner is not working`
  );
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Switches on the verb (SuperTest has no index signature) so an undrivable verb fails HERE by name, not as `undefined(...)` mid-loop.
const send = (verb: string, url: string) => {
  const req = request(app);
  switch (verb.toUpperCase()) {
    case "GET": return req.get(url).send({});
    case "POST": return req.post(url).send({});
    case "PUT": return req.put(url).send({});
    case "PATCH": return req.patch(url).send({});
    case "DELETE": return req.delete(url).send({});
    default: throw new Error(`admin-routes.test.ts cannot drive a ${verb} route (${url})`);
  }
};

// Mounting is composition, not ownership — reads the routes file's own import of the handler rather than assuming a sibling controller.
function controllerFor(r: Route): string | null {
  const read = (rel: string): string | null => {
    for (const ext of ["ts", "js"]) {
      try {
        return readFileSync(new URL(`../../../${rel.replace(/\.(ts|js)$/, "")}.${ext}`, import.meta.url), "utf8");
      } catch {
        /* try the other extension */
      }
    }
    return null;
  };

  let routes = null;
  try {
    routes = readFileSync(new URL(`../../../${r.file}`, import.meta.url), "utf8");
  } catch {
    routes = null;
  }
  if (routes) {
    const re = /import\s*\{([^}]*)\}\s*from\s*"#([^"]+)"/g;
    let m;
    while ((m = re.exec(routes)) !== null) {
      const named = m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim());
      if (!named.includes(r.handler)) continue;
      const src = read(m[2].replace(/^features\//, "features/"));
      if (src !== null) return src;
    }
  }
  return read(r.file.replace(/routes\.(js|ts)$/, "controller"));
}

test("every admin route refuses a signed-in customer", async () => {
  const reached: string[] = [];
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      for (const r of routes) {
        const res = await send(r.verb, r.url);
        if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`);
      }
    });
  }, { actor: TEST_ACTOR.id });
  assert.deepEqual(reached, [], `a customer was not refused by ${reached.length} route(s)`);
});

test("every admin route refuses an anonymous caller", async () => {
  const reached: string[] = [];
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const r of routes) {
        const res = await send(r.verb, r.url);
        if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`);
      }
    });
  }, { actor: TEST_ACTOR.id });
  assert.deepEqual(reached, [], `an anonymous caller was not refused by ${reached.length} route(s)`);
});

test("the set of admin-guarded routes is the one that was reviewed", () => {
  const current = adminRoutes.map((r) => `${r.verb} ${r.url}`).sort();

  const lost = INVENTORY.filter((r) => !current.includes(r));
  const added = current.filter((r) => !INVENTORY.includes(r));

  assert.deepEqual(
    lost,
    [],
    `${lost.length} route(s) no longer carry requireAdmin - if that is deliberate, update admin-routes.json in the same change`
  );
  assert.deepEqual(
    added,
    [],
    `${added.length} new admin route(s) - add them to admin-routes.json so the sweep covers them`
  );
});

// A requireUser handler must not trust user_id from the request. The route that motivated this, create_purchase_order, once took it from the body — a customer could place an order attributed to someone else, and that path buys a real FedEx label. It can't be driven from a test directly: demonstrating the bug would spend the money.
// requireOwnOrder covers routes whose subject is an ORDER id; this covers ones whose subject is the USER, which that middleware can't see.
// Reading user_id IS allowed when the handler also checks admin (e.g. retrieve_payment_intent, for an admin acting on a customer's behalf) — writing req.user.id is not reading one at all.
test("no requireUser handler takes a user_id from the request without an admin check", () => {
  const offenders = [];
  const unresolved = [];

  for (const r of allRoutes) {
    const isUserOnly =
      r.guards.some((g) => /requireUser/.test(g)) && !r.guards.some((g) => /requireAdmin/.test(g));
    if (!isUserOnly) continue;

    // Both extensions, and an unresolved handler is a FAILURE, not a skip — looking only for .js once silently dropped converted controllers out of this check as the TS conversion progressed.
    // The handler isn't always the routes file's sibling (ruling 13/26 — a route can be owned by the feature that owns its table) — resolved by following the routes file's own import first, falling back to the sibling.
    const src = controllerFor(r);
    if (src === null) {
      unresolved.push(`${r.verb} ${r.url} (no controller file)`);
      continue;
    }

    const start = src.indexOf(`export const ${r.handler}`);
    if (start < 0) {
      unresolved.push(`${r.verb} ${r.url} (${r.handler} not exported)`);
      continue;
    }
    const next = src.indexOf("\nexport const", start + 1);
    // Comments stripped: this very file explains the rule in prose above each
    // handler it applies to, and prose is not code.
    const body = src.slice(start, next < 0 ? src.length : next).replace(/\/\/[^\n]*/g, "");

    const readsFromRequest =
      /req\.(body|query)(\?)?\.user_id/.test(body) ||
      /\{[^}]*\buser_id\b[^}]*\}\s*=\s*req\.(body|query)/.test(body);
    const checksAdmin = /req\.user(\?)?\.role/.test(body);

    if (readsFromRequest && !checksAdmin) offenders.push(`${r.verb} ${r.url}`);
  }

  // A handler this cannot resolve is a failure, not a pass - otherwise a rename
  // or a conversion quietly empties the check.
  assert.deepEqual(
    unresolved,
    [],
    "could not find the handler for these routes, so they went unchecked"
  );
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} route(s) take a user_id from the request behind requireUser alone`
  );
});
