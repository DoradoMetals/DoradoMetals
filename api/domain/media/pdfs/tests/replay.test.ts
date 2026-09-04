// The four PDF routes, over real HTTP - service.test.ts already renders every document and checks the bytes; what it can't check is the HTTP boundary (guards, and the headers a browser needs to receive a file).
// One test renders for real (Content-Length can only be asserted against a real document) - closeBrowser() runs in afterAll(), or Chromium outlives the run and node never exits (has happened, cost an hour and eleven orphaned processes). Every other test stops at a guard.
// What these routes serve: for the order's OWNER (or an admin), they look up the latest media.pdfs row and serve the stored file, falling back to a live render (persisted for a linkable order) when none exists; everyone else gets a render of the body they posted, same as always - selection logic and ownership gate are pinned in serve.test.ts. In a test run the stored branch always falls back, so every render assertion below exercises the same path it always did.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as spotsService from "#domain/spots/service.ts";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anOrder, aProduct, aShipment, anAddress,
} from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
import { LOCKS } from "#shared/testing/locks.ts";
import query from "#shared/db/query.ts";

await mockSessions();
const { default: app } = await import("#app");

const ROUTES = [
  "generate_packing_list",
  "generate_return_packing_list",
  "generate_invoice",
  "generate_sales_order_invoice",
];

type UserFixture = { id: string; name: string | null; email: string | null };
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

const customer: UserFixture = TEST_CUSTOMER;

// THE ORDERS ARE BUILT INSIDE THE PIN (lane 1), AND THAT FIXED A REAL FLAKE.
// They used to be read through the API in `beforeAll`, on the pool, as
// "whichever order of this direction has lines" - so this file rendered
// documents for real customers' real orders, AND raced
// domain/orders/tests/edit-line.test.ts, which commits an order, runs, and
// deletes it again: a list taken between those two points named an order that
// no longer existed by the time the renderer looked it up, and the run failed
// four tests with `NotFound: no order <uuid>`. Nothing in the file could see
// the cause, because the fixture was correct when it was read.
//
// A built order cannot be deleted by another file, and both documents get an
// order that genuinely carries a line, an address and a parcel - which is what
// a packing list and an invoice actually render from.
const anOrderToRender = async (c: PoolClient, direction: "purchase" | "sale") => {
  const user = await aUser(c, { name: "Document Owner" });
  const address = await anAddress(c, user);
  const product = await aProduct(c);
  const built = await anOrder(c, user, { direction })
    .withBullion(product, 2, { price: 2500 })
    .withLots(1, { metal: "Gold", pre_melt: 5 })
    .withSpots()
    .withAddress(address)
    .withTotals({ total: 5200, shipping: 24.5, items: 5000 });
  await aShipment(c, built, { method: direction === "purchase" ? "CARRIER DROPOFF" : "DROPSHIP" });
  return { order: { id: built.id }, owner: user };
};

let spots: Spot[];

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  // The composed shape (name/ask/bid), the way the frontend sends them and the
  // calculations read them. spots.spots is reference data - a live feed, not a
  // fixture - so it stays a read.
  spots = await spotsService.getSpotPrices();
  assert.ok(spots.length > 0, "dev has no spot prices");
});

afterAll(async () => {
  // Otherwise Chromium outlives the test run and node never exits.
  await closeBrowser();
  restoreSessions();
  await pool.end();
});

// The other three, which only had the refusal until now: a return packing list, a purchase-order invoice and a sales-order invoice - the documents a customer and a refiner are sent.
// Each renders LIVE here from the server's own read: `customer` is generally not the order's owner, so serve.ts keeps the store shut and falls back to a render. Nothing else would notice the renderer breaking, which is what makes rendering them worth asserting rather than assuming.
// A PDF is checked by its magic bytes and a floor on its length - an empty or error page is still a 200 with content-type application/pdf, so the status alone proves nothing.
const RENDERS = [
  ["generate_return_packing_list", "return-packing-list.pdf", "purchase"],
  ["generate_invoice", "invoice.pdf", "purchase"],
  ["generate_sales_order_invoice", "invoice.pdf", "sale"],
];

// Declared as a tuple list - inferred, the element type collapses to `string` and the direction is not usable as one.
for (const [route, filename, direction] of RENDERS as Array<
  [string, string, "purchase" | "sale"]
>) {
  test(`${route} renders a real PDF`, async () => {
    await inPinnedTransaction(async (c: PoolClient) => {
      const { order } = await anOrderToRender(c, direction);
      await as({ ...customer, role: "user" }, async () => {
        const res = await request(app)
          .post(`/api/pdf/${route}`)
          .send({ order_id: order.id })
          .buffer(true)
          .parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on("data", (c: Buffer) => chunks.push(c));
            r.on("end", () => cb(null, Buffer.concat(chunks)));
          });

        assert.equal(res.status, 200, `${route} did not render`);
        assert.equal(res.headers["content-type"], "application/pdf");
        assert.match(
          res.headers["content-disposition"] ?? "",
          new RegExp(`attachment; filename="${filename.replace(".", "\\.")}"`),
          "the browser will not save this as a file"
        );
        assert.equal(
          res.body.subarray(0, 5).toString(),
          "%PDF-",
          `${route} returned something that is not a PDF`
        );
        assert.ok(
          res.body.length > 5000,
          `${route} rendered only ${res.body.length} bytes - an error page is still a PDF`
        );
      });
    }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
  });
}

test("every PDF route refuses an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const route of ROUTES) {
        const res = await request(app).post(`/api/pdf/${route}`).send({});
        assert.ok([401, 403].includes(res.status), `${route} answered ${res.status}`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// A guard that let an unauthenticated caller through would launch a browser per request - a denial-of-service surface as well as a leak, which is why the refusal above is asserted for all four.
test("no PDF route launches a renderer for an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const route of ROUTES) {
        const res = await request(app).post(`/api/pdf/${route}`).send({});
        assert.notEqual(
          res.headers["content-type"],
          "application/pdf",
          `${route} rendered a document for someone with no session`
        );
      }
    });
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// The one that renders: proves a signed-in caller receives a real file with the headers a browser needs to save it.
test("a signed-in caller gets a real PDF with the headers to download it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await anOrderToRender(c, "purchase");
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/pdf/generate_packing_list")
        .send({ order_id: order.id })
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      assert.equal(res.status, 200, "the packing list did not render");
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.match(
        res.headers["content-disposition"] ?? "",
        /attachment; filename="packing-list\.pdf"/,
        "the browser will not save this as a file"
      );

      const body = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
      assert.equal(
        body.subarray(0, 5).toString(),
        "%PDF-",
        "the response is not a PDF, whatever the header says"
      );
      assert.equal(
        Number(res.headers["content-length"]),
        body.length,
        "Content-Length disagrees with the document - a truncated download"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// The stored branch, over HTTP: serve.test.ts proves the selection logic with a stubbed reader; what it can't prove is the wiring (that the controller hands serve.ts the right order id and caller, and that a stored row can never turn a customer's download into a 500).
// In a test run the stored read always fails (like a deleted object would), so this drives the OWNER through a route whose order HAS a stored row and asserts the fallback still delivers a real PDF - "download must not break over bookkeeping", end to end.
test("an owner's download with a stored row still answers with a PDF when the store cannot", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // THE OWNER COMES BACK FROM THE BUILDER. This used to read the order's
    // user_id out of orders.orders and then look that person up in
    // exchange.users, with two guards saying what to do if either read came
    // back empty - both of which the builder makes unnecessary: the order has
    // an owner because the fixture gave it one.
    const { order, owner } = await anOrderToRender(c, "purchase");

    // Through the shared executor: while pinned, this joins the transaction that gets rolled back, so the row never outlives the test.
    await query(
      `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum)
       VALUES ('return_packing_list', $1, 'pdfs/replay/never-uploaded.pdf', 5, 'feed')`,
      [order.id]
    );

    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/pdf/generate_return_packing_list")
        .send({ order_id: order.id })
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      assert.equal(res.status, 200, "a stored row the storage cannot honour broke the download");
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.equal(res.body.subarray(0, 5).toString(), "%PDF-", "the fallback did not render");
    });
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});
