// The HTTP layer, over real requests.
//
// Everything else in this suite tests repos. Nothing tested the routes or the
// controllers, and that is where the bugs of this session actually lived:
// servicesRepo.remove(req.body) passed a whole request body where an id was
// wanted, and the transactions controller still reads req.body.user_id on a
// GET. Neither is visible from a repo test, because neither is in a repo.
//
// Two properties are worth asserting at this level, and they are the two a repo
// test can never reach:
//
//   every endpoint is either guarded or deliberately public, and
//   a guarded endpoint refuses an anonymous request rather than serving it.
//
// The second is the one that matters. A route registered without its middleware
// is a silent hole - it returns 200 with somebody's data and nothing fails.
//
// Read-only: every request here is either rejected before reaching a controller
// or hits a public read. Nothing in this file writes.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "#app";
import pool from "#db";

// Endpoints that are meant to answer an anonymous request. Anything not on this
// list must be guarded; add to it deliberately, not to make a test pass.
const PUBLIC = new Set([
  "GET /api/products/get_all_products",
  "GET /api/products/get_homepage_products",
  "GET /api/products/get_product_from_slug",
  "GET /api/products/get_products",
  "GET /api/products/get_sell_products",
  "GET /api/rates/get_all",
  "GET /api/reviews/get_public",
  "GET /api/spots/spot_prices",
  "POST /api/recaptcha/verify-recaptcha",
  // The four cart endpoints used to be here, with the reason "a cart belongs to
  // a browser, not an account - a signed-out visitor has one". That is true of
  // the browser-local store and was NOT true of these endpoints: they took a
  // user id out of the request and were unauthenticated, so an anonymous caller
  // could read and replace anybody's cart. Demonstrated with a real request
  // before being fixed. They are guarded now and take the id from the session.
]);

// better-auth and the Stripe webhook are mounted on the app rather than through
// a feature router, and both authenticate by their own means - a signature for
// the webhook, a session for better-auth itself.
const NOT_OURS = new Set(["POST /api/auth/stripe/webhook", "ACL /api/auth/*"]);

function inventory() {
  const found = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const method = Object.keys(layer.route.methods)[0].toUpperCase();
        const key = `${method} ${prefix + layer.route.path}`;
        found.push({
          method,
          path: prefix + layer.route.path,
          key,
          // Whether a route is expected to reject an anonymous request is not
          // something to infer from how many handlers it has. It used to count
          // them - more than one meant "has middleware, so it must be guarded" -
          // and that broke the moment a PUBLIC route grew a second middleware
          // for an unrelated reason: the wire adapter. The route was public,
          // answered anonymously as it should, and the test called it a hole.
          //
          // The real property is the list below. A route is expected to reject
          // anonymous callers unless it has been deliberately declared public,
          // and that declaration is the thing worth maintaining.
          guarded: !PUBLIC.has(key) && !NOT_OURS.has(key),
          // Kept for the first test, which checks the declaration against
          // reality: a route with no middleware at all cannot be guarded.
          hasMiddleware: layer.route.stack.length > 1,
        });
      } else if (layer.name === "router" && layer.handle?.stack) {
        const mount = layer.regexp.source
          .replace(/^\^/, "")
          .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
          .replace(/\\\//g, "/");
        walk(layer.handle.stack, prefix + mount);
      }
    }
  };
  walk(app._router.stack, "");
  return found;
}

const endpoints = inventory();

after(async () => {
  await pool.end();
});

before(() => {
  assert.ok(endpoints.length > 100, `only ${endpoints.length} endpoints found - the walk is wrong`);
});

test("every endpoint is either guarded or deliberately public", () => {
  const unguarded = endpoints
    .filter((e) => !e.hasMiddleware && !PUBLIC.has(e.key) && !NOT_OURS.has(e.key))
    .map((e) => e.key);

  assert.deepEqual(
    unguarded,
    [],
    "these endpoints have no middleware and are not on the public list - " +
      "either add the guard or add them to PUBLIC with a reason"
  );
});

// The list is only useful if it stays honest, so an entry that no longer
// matches a route is a failure too.
test("the public list has no entries that are not routes", () => {
  const keys = new Set(endpoints.map((e) => e.key));
  const stale = [...PUBLIC, ...NOT_OURS].filter((k) => !keys.has(k));
  assert.deepEqual(stale, [], "PUBLIC/NOT_OURS names endpoints that no longer exist");
});

// The property worth the most: a guarded endpoint must refuse an anonymous
// request. 401 or 403 - never 200, and never 500, which would mean the guard
// threw rather than declined.
test("no guarded endpoint answers an anonymous request", async () => {
  const guarded = endpoints.filter((e) => e.guarded);
  assert.ok(guarded.length > 90, `only ${guarded.length} guarded endpoints to check`);

  const served = [];
  for (const e of guarded) {
    const res = await request(app)[e.method.toLowerCase()](e.path).send({});
    if (res.status !== 401 && res.status !== 403) {
      served.push(`${e.key} -> ${res.status}`);
    }
  }
  assert.deepEqual(served, [], "these answered a request with no session");
});

test("an unknown route returns JSON, not an HTML error page", async () => {
  const res = await request(app).get("/api/definitely-not-a-route");
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "Not Found" });
});

// The public reads are the ones a signed-out visitor actually gets, so they are
// worth asserting return something rather than merely not erroring.
test("public reads return JSON", async () => {
  const reads = [
    ["/api/products/get_all_products", true],
    ["/api/spots/spot_prices", true],
    ["/api/rates/get_all", true],
    ["/api/reviews/get_public", false],
  ];

  for (const [path, mustHaveRows] of reads) {
    const res = await request(app).get(path);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
    assert.ok(Array.isArray(res.body), `${path} did not return an array`);
    if (mustHaveRows) {
      assert.ok(res.body.length > 0, `${path} returned an empty array - dev has rows for this`);
    }
  }
});

// Every handler a controller exports is either routed or declared dead.
//
// features/sales-orders/controller.js exports getSalesOrderById, which has no
// route. That is harmless until somebody reads one, assumes
// it is reachable, and builds on it - or until a route is deleted and its
// handler is left behind looking live.
//
// A handler with no route is not automatically wrong: handleStripeWebhook is
// mounted directly on the app rather than through a feature router, and a
// controller may reasonably export a helper. So this is a declaration, not a
// prohibition: unrouted exports go on the list below with a reason, and the
// list failing when it goes stale is what keeps it honest.
//
// IT SEARCHES EVERY routes.js, NOT THE SIBLING ONE. The first version looked
// only next to the controller and reported features/mints/controller.js as
// entirely unrouted - which would have meant a migrated feature with a switch
// in PROMOTION.md was unreachable over HTTP. It is not: getAllMints is routed
// from features/products/routes.js, deliberately, because the frontend asks
// products for its mints. A check that assumes a convention reports a
// legitimate exception to the convention as a bug.
//
// Static - reads the files, and compares against the routes the walk above
// found in the real app.
import fs from "node:fs";
import path from "node:path";

const FEATURES = path.join(import.meta.dirname, "..", "..", "features");

// Exported from a controller and deliberately not routed.
//
// KEYED BY FILENAME, so these move when a controller is converted. That is not
// incidental bookkeeping: if a key stops matching, its handlers stop being
// "declared dead" and the test reports them as unrouted - which is the right
// failure, and is how this list stays honest.
const UNROUTED = {
  "sales-orders/controller.ts": {
    getSalesOrderById: "no route; the frontend reads orders through get_all and get_sales_orders",
    // cancelOrder was here and the handler is now gone. It awaited
    // salesOrderService.cancelOrder, which the service has never defined, so it
    // could not have worked if anyone had routed it - and the reason recorded
    // here for leaving it unrouted (cancelling a sale is not a customer action;
    // admins use update_status) is the reason it should not exist at all.
    // This list going stale is what surfaced that, which is the check working.
  },
  "purchase-orders/controller.ts": {
    getPurchaseOrderById: "no route; the frontend reads orders through get_purchase_orders and get_all_purchase_orders",
  },
  "payments/controller.ts": {
    handleStripeWebhook: "mounted directly on the app in app.js, before express.json",
  },
};

const controllers = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) controllers(full, out);
    // .ts as well as .js. The controllers are being converted one batch at a
    // time, and this scan looked only for controller.js - so a converted
    // controller became invisible and its routes "went unchecked", which is
    // exactly what the assertion below refuses to let pass silently. It caught
    // the first batch; this is the fix rather than a suppression.
    else if (e.name === "controller.js" || e.name === "controller.ts") out.push(full);
  }
  return out;
};

// Every routes file in the tree - BOTH EXTENSIONS - because a handler may
// legitimately be routed from another feature's router. Matching only
// "routes.js" would have shrunk this walk with every conversion batch.
const routeFiles = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(full, out);
    else if (e.name === "routes.js" || e.name === "routes.ts") out.push(full);
  }
  return out;
};

const exportedHandlers = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*asyncHandler/g)) {
    names.add(m[1]);
  }
  return names;
};

test("every exported controller handler is routed, or declared unrouted", () => {
  const orphans = [];
  const stale = [];
  const allRoutes = routeFiles(FEATURES).map((f) => fs.readFileSync(f, "utf8"));
  assert.ok(allRoutes.length > 10, `only ${allRoutes.length} routes file(s) found - the walk is wrong`);

  for (const file of controllers(FEATURES)) {
    const rel = path.relative(FEATURES, file);
    const src = fs.readFileSync(file, "utf8");
    const declared = UNROUTED[rel] ?? {};

    for (const name of exportedHandlers(src)) {
      const routed = allRoutes.some((r) => new RegExp(`\\b${name}\\b`).test(r));
      if (!routed && !declared[name]) orphans.push(`${rel}: ${name}`);
    }

    for (const name of Object.keys(declared)) {
      if (!exportedHandlers(src).has(name)) stale.push(`${rel}: ${name}`);
    }
  }

  assert.deepEqual(
    orphans,
    [],
    "these handlers are exported and never routed - wire them or add them to " +
      "UNROUTED with the reason"
  );
  assert.deepEqual(stale, [], "UNROUTED names handlers that no longer exist");
});

// Proved rather than assumed, in both directions: a handler that is neither
// routed nor declared must be reported, and a declaration for a handler that no
// longer exists must be reported too. Both run against synthetic input rather
// than by breaking a real file, so this costs nothing and cannot leave debris.
test("the unrouted check can actually fail", () => {
  const handlers = exportedHandlers(`
    export const wired = asyncHandler(async () => {});
    export const orphaned = asyncHandler(async () => {});
  `);
  assert.deepEqual([...handlers].sort(), ["orphaned", "wired"]);

  const routes = ['router.get("/x", wired);'];
  const unrouted = [...handlers].filter(
    (name) => !routes.some((r) => new RegExp(`\\b${name}\\b`).test(r))
  );
  assert.deepEqual(unrouted, ["orphaned"], "an unrouted handler was not spotted");

  // And a name routed from a DIFFERENT file counts as routed, which is the
  // thing the first version of this check got wrong.
  const elsewhere = ['router.get("/y", orphaned);'];
  const stillUnrouted = [...handlers].filter(
    (name) => ![...routes, ...elsewhere].some((r) => new RegExp(`\\b${name}\\b`).test(r))
  );
  assert.deepEqual(stillUnrouted, [], "a handler routed from another feature was called an orphan");
});

// No public endpoint may name a user.
//
// THIS IS THE CART BUG, TURNED INTO A CHECK. Those four were on PUBLIC with the
// reason "a cart belongs to a browser, not an account - a signed-out visitor has
// one". True of the browser-local store, false of the endpoints: they read
// req.query.user_id and req.body.user_id, so anyone could read and overwrite
// anybody's cart. The reason described the feature and not the endpoint, and it
// was checkable prose that nobody checked.
//
// The property that would have caught it is narrow and mechanical: an endpoint
// answering anonymous callers must not take a user id out of the request. There
// is no session to compare it against, so it can only be obeyed.
//
// The remaining nine entries were audited by hand when this was written and all
// nine are legitimately public - five product reads over the catalogue, the rate
// bands, the public reviews (hidden = false, limit 10), spot prices, and the
// recaptcha verifier. Two had admin siblings and were checked against them:
// getAllRates omits the audit columns getAdminRates returns, and
// getPublicReviews filters. This exists so the tenth entry is checked by
// something other than somebody remembering to.
test("no public endpoint reads a user id from the request", () => {
  const handlerFor = (key) => {
    const [method, full] = key.split(" ");
    const tail = full.replace(/^\/api\/[^/]+/, "");
    for (const file of routeFiles(FEATURES)) {
      const src = fs.readFileSync(file, "utf8");
      const line = src
        .split("\n")
        .find(
          (l) =>
            l.includes(`router.${method.toLowerCase()}(`) &&
            (l.includes(`"${tail}"`) || l.includes(`'${tail}'`))
        );
      if (!line) continue;
      const name = line.match(/,\s*([A-Za-z0-9_]+)\s*\)\s*;?\s*$/)?.[1];
      if (name) return { name, dir: path.dirname(file) };
    }
    return null;
  };

  const bodyOf = (dir, name) => {
    // .ts as well as .js, for the same reason the scan above needed it: the
    // controllers are being converted a batch at a time, and this looked only
    // for controller.js. A converted controller resolved to null, which this
    // test correctly treats as "went unchecked" rather than "fine".
    const file = [path.join(dir, "controller.ts"), path.join(dir, "controller.js")].find(
      (f) => fs.existsSync(f)
    );
    if (!file) return null;
    const src = fs.readFileSync(file, "utf8");
    const start = src.indexOf(`export const ${name} =`);
    if (start === -1) return null;
    const next = src.indexOf("\nexport const ", start + 1);
    return src.slice(start, next === -1 ? undefined : next);
  };

  const offenders = [];
  const unresolved = [];

  for (const key of PUBLIC) {
    const found = handlerFor(key);
    if (!found) {
      unresolved.push(key);
      continue;
    }
    const body = bodyOf(found.dir, found.name);
    if (body === null) {
      unresolved.push(`${key} (${found.name})`);
      continue;
    }
    if (/\buser_id\b|\buserId\b/.test(body)) {
      offenders.push(`${key} -> ${found.name}`);
    }
  }

  // A route this cannot resolve is a failure, not a pass. Otherwise renaming a
  // handler or reformatting a routes file would quietly empty the check - the
  // same way validate:wire lost four endpoints to a directory rename.
  assert.deepEqual(
    unresolved,
    [],
    "could not find the handler for these public routes, so they went unchecked"
  );

  assert.deepEqual(
    offenders,
    [],
    "these answer anonymous callers AND take a user id from the request - there " +
      "is no session to check it against, so it can only be obeyed"
  );
});
