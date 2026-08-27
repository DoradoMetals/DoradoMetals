// Every admin route refuses a customer and refuses an anonymous caller.
//
// WHY THIS FILE EXISTS. 00a0853b found that get_payout_details - the endpoint
// that returns plaintext routing and account numbers - had a test that drove it
// AS an admin and asserted the response shape, and nothing that asserted the
// guard. That proves the handler works and says nothing about who can reach it.
// Writing that assertion by hand for one endpoint fixes one endpoint. There are
// seventy-eight.
//
// The list is not maintained here. scripts/route-guards.mjs reads every
// routes.js and resolves each mount from app.js - the prefix is not derivable
// from the folder name, features/refiners mounts at /api/suppliers - so a route
// added tomorrow is covered tomorrow without anyone remembering to add it.
//
// WHAT IS DELIBERATELY EXCLUDED, AND WHY. DELETE /api/purchase_orders/purge_cancelled
// is `DELETE FROM exchange.purchase_orders` with no id. CLAUDE.md excludes it
// from testing and that is not negotiable for a test whose whole premise is
// "drive this without being allowed to". If its guard were missing, the test
// that discovered so would be the thing that emptied the table.
//
// SAFETY OF THE REST. Every request carries an empty body, so a route whose
// guard was missing would run with no id and update nothing. That is a
// mitigation, not a guarantee - which is why the exclusion above is by name
// rather than by hoping.
//
// NO RESPONSE BODY IS PRINTED OR INTERPOLATED, on any path including the
// failure messages. Several of these routes return payouts.
//
// WHAT THE SWEEP ALONE CANNOT CATCH, AND WHY THE INVENTORY IS HERE.
//
// The sweep derives its list of admin routes from the same routes.js it is
// checking. So DELETING a guard does not fail it - the route simply stops being
// an admin route and stops being tested. I found that out by removing
// requireAdmin from GET /api/leads/get_all and watching the suite pass, which
// is the same tautology as a coverage metric built out of the thing it
// measures.
//
// The mechanism is sound - with that guard removed, a customer session really
// does get 200 from that route, measured directly - so the sweep does catch a
// guard that is PRESENT BUT INEFFECTIVE.
//
// admin-routes.json is what catches the other case: a committed inventory of
// which routes are admin-guarded. Remove a guard and the set no longer matches.
// Adding an admin route means updating that file, which is a deliberate act
// with a diff attached, and that is the point.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { adminRoutes, allRoutes } from "../../scripts/route-guards.mjs";
import { readFileSync } from "node:fs";

const INVENTORY = JSON.parse(
  readFileSync(new URL("./admin-routes.json", import.meta.url), "utf8")
);

await mockSessions();
const { default: app } = await import("#app");

const EXCLUDED = new Set(["/api/purchase_orders/purge_cancelled"]);

const routes = adminRoutes.filter((r) => r.url && !EXCLUDED.has(r.url));

let customer;

before(async () => {
  customer = (
    await outside(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(customer, "dev has no non-admin user - every assertion below would prove nothing");

  // If the scanner ever stops resolving routes, this suite would silently
  // assert nothing at all and still report green.
  assert.ok(
    routes.length >= 70,
    `only ${routes.length} admin routes resolved - the scanner is not working`
  );
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const send = (verb, url) => {
  const req = request(app);
  const method = verb.toLowerCase();
  return req[method](url).send({});
};

test("every admin route refuses a signed-in customer", async () => {
  const reached = [];
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      for (const r of routes) {
        const res = await send(r.verb, r.url);
        if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`);
      }
    });
  });
  assert.deepEqual(reached, [], `a customer was not refused by ${reached.length} route(s)`);
});

test("every admin route refuses an anonymous caller", async () => {
  const reached = [];
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const r of routes) {
        const res = await send(r.verb, r.url);
        if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`);
      }
    });
  });
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

// A requireUser handler must not believe an identity that came from the request.
//
// WHY THIS IS STATIC AND NOT A REQUEST. The route that motivated it,
// POST /api/purchase_orders/create_purchase_order, took `user_id` from the body
// behind requireUser - so a signed-in customer could place an order attributed
// to somebody else, and that path buys a real FedEx label and can book a
// courier on the way through. It cannot be driven from a test for exactly that
// reason: the request that demonstrated the bug would be the one that spent the
// money. FOLLOWUPS had recorded it and deferred it while the write path was
// mid-rebuild; that rebuild has landed, so it is fixed and this holds it.
//
// requireOwnOrder covers the routes whose subject is an ORDER id. This covers
// the ones whose subject is the USER, which that middleware cannot see.
//
// Reading `user_id` is allowed when the handler also asks whether the caller is
// an admin - GET /api/stripe/retrieve_payment_intent does exactly that, and an
// admin acting for a named customer is a real flow. Writing
// `user_id: req.user.id` is not reading one at all.
test("no requireUser handler takes a user_id from the request without an admin check", () => {
  const offenders = [];
  const unresolved = [];

  for (const r of allRoutes) {
    const isUserOnly =
      r.guards.some((g) => /requireUser/.test(g)) && !r.guards.some((g) => /requireAdmin/.test(g));
    if (!isUserOnly) continue;

    // BOTH EXTENSIONS, AND A HANDLER THIS CANNOT FIND IS A FAILURE.
    //
    // This looked only for controller.js and skipped silently when the read
    // threw. The controllers are being converted a batch at a time, so a
    // converted one would have dropped out of this rule without a word - the
    // check would still report clean while covering less of the surface every
    // time another batch landed. shared/http/endpoints.test.js had the same
    // assumption and caught it by refusing; this now refuses too.
    let src = null;
    for (const ext of ["ts", "js"]) {
      const controller = r.file.replace(/routes\.(js|ts)$/, `controller.${ext}`);
      try {
        src = readFileSync(new URL(`../../${controller}`, import.meta.url), "utf8");
        break;
      } catch {
        /* try the other extension */
      }
    }
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
