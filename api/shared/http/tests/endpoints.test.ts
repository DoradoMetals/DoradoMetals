// The HTTP layer, over real requests — a repo test never sees routing/controller bugs (servicesRepo.remove(req.body) passing a whole body where an id was wanted; a GET controller reading req.body.user_id), because neither lives in a repo.
// Two properties only this level can check: every endpoint is guarded or deliberately public, and a guarded endpoint refuses an anonymous request rather than serving it — the second matters most, since an unguarded route silently returns 200 with somebody's data.
// Read-only: every request here is rejected before a controller or hits a public read.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import pool from "#pool";

// Mount strings recorded at construction — express 5 keeps only compiled matcher closures per layer, with no reflection back to the path string, so this records what each use() was told before the app is built (the app import below is deliberately dynamic, after this patch).
const MOUNTS = new WeakMap<object, string>();
{
  const proto = (express.Router as unknown as { prototype?: Record<string, unknown> }).prototype
    ?? Object.getPrototypeOf(express.Router());
  const target = proto as { use: (...args: unknown[]) => unknown };
  const origUse = target.use;
  target.use = function (...args: unknown[]) {
    if (typeof args[0] === "string") {
      for (const h of (args.slice(1) as unknown[]).flat(Infinity)) {
        if (typeof h === "function") MOUNTS.set(h as object, args[0] as string);
      }
    }
    return origUse.apply(this, args);
  };
}
const { default: app } = await import("#app");

// Endpoints that are meant to answer an anonymous request. Anything not on this
// list must be guarded; add to it deliberately, not to make a test pass.
const PUBLIC = new Set([
  "GET /api/products/",
  "GET /api/products/:slug",
  "GET /api/rates/",
  "GET /api/rates/tiers",
  "GET /api/reviews/public",
  "GET /api/spots/",
  "POST /api/recaptcha/verify-recaptcha",
  // Public because the catalogue's prices are public — takes product ids and a side, never a user; prices come from the server's own spots.
  "POST /api/quotes/catalog",
  // Same reasoning, bid direction — items and goods declarations in, prices out; nothing about a user crosses it.
  "POST /api/quotes/purchase_order",
  // Reference rows public pages print (product page delivery prices/payment options, payout landing methods) — fees and marketing copy, nothing about a user.
  "GET /api/payments/methods/",
  "GET /api/carrier_services/sale_options",
  // The four cart endpoints used to be here ("a cart belongs to a browser, not an account") — true of the local store, false of these: they took a user id from the request while unauthenticated, so an anonymous caller could read and replace anybody's cart. Demonstrated with a real request before being fixed; now guarded, taking the id from the session.
]);

// better-auth and the Stripe webhook are mounted on the app rather than through
// a feature router, and both authenticate by their own means - a signature for
// the webhook, a session for better-auth itself.
const NOT_OURS = new Set(["POST /api/auth/stripe/webhook", "ALL /api/auth/*splat"]);

// One named call per verb. SuperTest has no index signature, so `req[method]`
// cannot be checked - and an unrecognised verb should say so rather than
// throwing "undefined is not a function" inside a loop over a hundred routes.
const send = (verb: string, url: string) => {
  const req = request(app);
  switch (verb.toUpperCase()) {
    case "GET": return req.get(url).send({});
    case "POST": return req.post(url).send({});
    case "PUT": return req.put(url).send({});
    case "PATCH": return req.patch(url).send({});
    case "DELETE": return req.delete(url).send({});
    default: throw new Error(`endpoints.test.ts cannot drive a ${verb} endpoint (${url})`);
  }
};

/** One mounted endpoint, as this file's own walk of the express stack sees it. */
type Endpoint = {
  method: string;
  path: string;
  key: string;
  guarded: boolean;
  hasMiddleware: boolean;
};

// Express's router internals aren't in @types/express — declared here as the subset this walk reads. express 5 replaced each layer's `regexp` with matcher closures that hide the mount string, so the walk descends by PROBING a matcher with a URL, not by parsing a regex.
type Matcher = (url: string) => false | { path: string };
type Layer = {
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: unknown[] };
  name?: string;
  handle?: { stack?: Layer[] };
  matchers?: Matcher[];
};

function inventory(): Endpoint[] {
  const found: Endpoint[] = [];
  const walk = (stack: Layer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        // An app.all route is ONE census entry (keyed ALL) — express 5 enumerates all 35 HTTP methods for it instead of express 4's single `_all` flag, so 'more methods than anyone declares by hand' is the tell.
        const names = Object.keys(layer.route.methods);
        const methods = layer.route.methods._all || names.length > 10
          ? ["ALL"]
          : names.map((m) => m.toUpperCase());
        for (const routePath of paths) {
          for (const method of methods) {
            const key = `${method} ${prefix + routePath}`;
            found.push({
              method,
              path: prefix + routePath,
              key,
              // Guarded is read off the PUBLIC/NOT_OURS declarations, not inferred from middleware count — that declaration is the thing worth maintaining.
              guarded: !PUBLIC.has(key) && !NOT_OURS.has(key),
              // Kept for the first test, which checks the declaration against
              // reality: a route with no middleware at all cannot be guarded.
              hasMiddleware: layer.route.stack.length > 1,
            });
          }
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        const mount = MOUNTS.get(layer.handle);
        assert.ok(
          mount !== undefined,
          "a mounted router was never seen by the recording use() - the walk is broken"
        );
        // A child mounted at "/" contributes no path segment - composing it
        // literally would spell /api/shipping//validate_address.
        walk(layer.handle.stack, prefix + (mount === "/" ? "" : mount));
      }
    }
  };
  const holder = app as unknown as { router?: { stack?: Layer[] }; _router?: { stack?: Layer[] } };
  const router = holder.router ?? holder._router;
  assert.ok(router?.stack, "could not read the express router stack - the walk is broken");
  walk(router.stack, "");
  return found;
}

const endpoints = inventory();

afterAll(async () => {
  await pool.end();
});

beforeAll(() => {
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

  const served: string[] = [];
  for (const e of guarded) {
    // Named calls rather than `request(app)[method]`: SuperTest declares no
    // index signature, and a verb this file cannot drive should fail by name
    // instead of becoming `undefined(...)` a hundred endpoints in.
    const res = await send(e.method, e.path);
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
  const reads: [path: string, mustHaveRows: boolean][] = [
    ["/api/products", true],
    ["/api/spots", true],
    ["/api/rates", true],
    ["/api/rates/tiers", true],
    ["/api/reviews/public", false],
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

// Every handler a controller exports is either routed or declared dead — harmless until somebody assumes an orphan is reachable, or a deleted route leaves its handler looking live. A handler with no route isn't automatically wrong (a mounted-directly webhook, a reasonable helper), so unrouted exports go on UNROUTED with a reason, and the list failing when it's stale keeps it honest.
// Searches EVERY routes file, not just the sibling one — a convention-only check once reported a legitimately cross-routed handler (mints' listMints, when it was routed from products' own router) as unrouted.
//
// Static - reads the files, and compares against the routes the walk above
// found in the real app.
import fs from "node:fs";
import path from "node:path";

// routes.ts and controller.ts live under transport/ now (db/domain hold neither); this walk moved with them.
const FEATURES = path.join(import.meta.dirname, "..", "..", "..", "transport");

// Exported from a controller and deliberately not routed.
// Keyed by filename, so an entry moves when its controller is converted — if a key stops matching, its handlers stop being 'declared dead' and get reported as unrouted, which is the right failure.
const UNROUTED = {
  "payments/controller.ts": {
    handleStripeWebhook: "mounted directly on the app in app.ts, before express.json",
  },
} satisfies Record<string, Record<string, string>> as Record<
  string,
  Record<string, string> | undefined
>;

const controllers = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) controllers(full, out);
    // .ts as well as .js — looking only for controller.js once made a converted controller invisible, so its routes went unchecked silently.
    else if (e.name === "controller.js" || e.name === "controller.ts") out.push(full);
  }
  return out;
};

// Every routes file, both extensions AND prefixed names (e.g. `creates.routes.ts`) — matching only exact `routes.js` once silently dropped six live handlers (features/orders/creates.routes.ts) from this walk; the same hardcoded-filename bug independently dropped the same six routes from scripts/route-guards.ts's security census.
const routeFiles = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(full, out);
    else if (/(^|\.)routes\.(js|ts)$/.test(e.name)) out.push(full);
  }
  return out;
};

const exportedHandlers = (src: string): Set<string> => {
  const names = new Set<string>();
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

// No public endpoint may name a user — turns the cart bug into a mechanical check: those four endpoints were marked public with a true-sounding reason ("a cart belongs to a browser") that described the FEATURE, not the endpoint, while they read user_id straight from the request. Checkable prose that nobody checked.
// The property that would have caught it is narrow: an endpoint answering anonymous callers must not take a user id from the request — there's no session to compare it against, so it can only be obeyed.
// The other nine PUBLIC entries were hand-audited when this was written (catalogue reads, rate bands, public reviews, spot prices, recaptcha) — two checked against their admin siblings to confirm they omit what an admin sees.
test("no public endpoint reads a user id from the request", () => {
  const handlerFor = (key: string): { name: string; dir: string } | null => {
    const [method, full] = key.split(" ");
    const tail = full.replace(/^\/api\/[^/]+/, "");
    // A ROUTE DECLARED AS "/" CARRIES ITS PATH IN ITS MOUNT, so the literal
    // scan below - which reads every routes.ts in turn - matches whichever
    // feature happens to declare `router.get("/")` first, and attributes the
    // handler to the wrong file. It reported `GET /api/products/` as
    // checkout's `getCheckout`. The directory resolution underneath is the
    // one that can answer this case, so it goes first rather than last.
    if (tail !== "/") for (const file of routeFiles(FEATURES)) {
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
    // A sub-resource route declared as "/" carries its path in its mount instead — resolved by the URL's own directory segments instead (e.g. /api/payments/methods/ -> transport/payments/methods/routes.ts).
    const segments = full.replace(/^\/api\//, "").split("/").filter(Boolean);
    const dir = path.join(FEATURES, ...segments);
    const file = path.join(dir, "routes.ts");
    if (fs.existsSync(file)) {
      const src = fs.readFileSync(file, "utf8");
      const line = src
        .split("\n")
        .find(
          (l) =>
            l.includes(`router.${method.toLowerCase()}(`) &&
            (l.includes(`"/"`) || l.includes(`'/'`))
        );
      const name = line?.match(/,\s*([A-Za-z0-9_]+)\s*\)\s*;?\s*$/)?.[1];
      if (name) return { name, dir };
    }
    return null;
  };

  const bodyOf = (dir: string, name: string): string | null => {
    // .ts as well as .js, same reason as above — a converted controller resolves to null, correctly treated as 'went unchecked' rather than 'fine'.
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
