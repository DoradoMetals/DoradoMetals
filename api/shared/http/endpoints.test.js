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
  // A cart belongs to a browser, not an account - a signed-out visitor has one.
  "GET /api/cart/get_cart",
  "GET /api/cart/get_sell_cart",
  "POST /api/cart/sync_cart",
  "POST /api/cart/sync_sell_cart",
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
        found.push({
          method,
          path: prefix + layer.route.path,
          key: `${method} ${prefix + layer.route.path}`,
          // One handler means the controller and nothing before it.
          guarded: layer.route.stack.length > 1,
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
    .filter((e) => !e.guarded && !PUBLIC.has(e.key) && !NOT_OURS.has(e.key))
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
  const guarded = endpoints.filter((e) => e.guarded && !NOT_OURS.has(e.key));
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
