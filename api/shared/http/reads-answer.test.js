// Every mounted READ route, driven over HTTP as the role it requires.
//
// WHY THIS FILE EXISTS. Two routes had answered 500 on every call since
// December 2025 - update_payment_intent and update_tracking - and both were
// found by reading code rather than by any test, because neither had ever been
// driven over HTTP. An inventory afterwards found 57 of 132 mounted routes in
// that position.
//
// The defect both shared is now caught statically by lint:namespace-calls. This
// covers the rest of what only running the thing can show: a handler that
// destructures something absent, a repo call with its arguments in the wrong
// order, a projection naming a column that has been renamed. None of that is
// visible to a repo test, and none of it is visible to a typecheck while the
// files are JavaScript.
//
// READS ONLY, AND THAT IS THE WHOLE DESIGN. Among the untested routes are ones
// that send mail to a refiner, buy a FedEx label and talk to Stripe. A blanket
// smoke test over all 57 would do those things. Every route here is a GET that
// writes nothing, so the suite is safe to run in a loop.
//
// WHAT IT ASSERTS. Not the body - that is the contract tests' job, and asserting
// shape here would duplicate validate:wire. It asserts the route ANSWERS: a
// status under 500, and no structural failure in the response. A 4xx is a pass,
// because a read refusing a request it does not like is the handler working.
//
// NOTHING IS COMMITTED: reads write nothing, and the pinned pool is used anyway
// so a handler that unexpectedly writes cannot escape.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let customer;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  customer = (
    await outside(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(admin && customer, "dev needs an admin and a non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Every one of these was in the never-driven list. `who` is the weakest role the
// route accepts, so a guard that is stricter than declared shows up as a 403
// rather than passing silently.
const READS = [
  ["public", "/api/products/get_sell_products"],
  ["public", "/api/products/get_homepage_products"],
  ["public", "/api/products/get_products"],
  ["admin", "/api/products/get_admin_products"],
  ["admin", "/api/products/get_metals"],
  ["admin", "/api/products/get_mints"],
  ["admin", "/api/products/get_product_types"],
  ["user", "/api/cart/get_cart"],
  ["admin", "/api/fulfillments/methods/all"],
  ["admin", "/api/fulfillments/schedule"],
  ["user", "/api/orders"],
];

for (const [who, url] of READS) {
  test(`${url} answers as ${who}`, async () => {
    await inPinnedTransaction(async () => {
      const call = async () => {
        const res = await request(app).get(url);
        // Under 500 is the bar. A 4xx means the handler ran and declined; a 500
        // means it fell over, which is what both December bugs looked like.
        assert.ok(
          res.status < 500,
          `${url} answered ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`
        );
        const body = JSON.stringify(res.body ?? "");
        for (const smell of ["is not a function", "is not defined", "Cannot read properties"]) {
          assert.ok(!body.includes(smell), `${url} failed structurally: ${smell}`);
        }
      };

      if (who === "public") return call();
      const role = who === "admin" ? "admin" : "user";
      const person = who === "admin" ? admin : customer;
      await as({ ...person, role }, call);
    });
  });
}
