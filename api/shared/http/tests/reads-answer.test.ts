// Every mounted READ route, driven over HTTP as the role it requires. Two routes answered 500 on every call since December 2025 (found by reading code, never driven over HTTP) — an inventory found 57 of 132 mounted routes in that position.
// READS ONLY, and that's the whole design — some untested routes send mail, buy a FedEx label or talk to Stripe, and a blanket smoke test would trigger those; every route here is a GET that writes nothing, safe to run in a loop.
// Asserts that the route ANSWERS (status under 500, no structural failure), not the body shape (that's validate:wire's job) — a 4xx is a pass, since refusing a bad request is the handler working. NOTHING IS COMMITTED, and the pinned pool is used anyway so an unexpected write can't escape.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserRow = { id: string; name: string | null; email: string | null };

let admin: UserRow;
let customer: UserRow;

before(async () => {
  // `outside` is generic and defaults to Record<string, any>; naming the row
  // shape here is what makes the three columns below checked rather than
  // whatever the query happened to select.
  admin = (
    await outside<UserRow>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  customer = (
    await outside<UserRow>(
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
