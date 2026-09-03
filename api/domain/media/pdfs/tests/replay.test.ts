// The four PDF routes, over real HTTP - service.test.ts already renders every document and checks the bytes; what it can't check is the HTTP boundary (guards, and the headers a browser needs to receive a file).
// One test renders for real (Content-Length can only be asserted against a real document) - closeBrowser() runs in after(), or Chromium outlives the run and node never exits (has happened, cost an hour and eleven orphaned processes). Every other test stops at a guard.
// What these routes serve: for the order's OWNER (or an admin), they look up the latest media.pdfs row and serve the stored file, falling back to a live render (persisted for a linkable order) when none exists; everyone else gets a render of the body they posted, same as always - selection logic and ownership gate are pinned in serve.test.ts. In a test run the stored branch always falls back, so every render assertion below exercises the same path it always did.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as poRepo from "#domain/orders/read.service.ts";
import * as soRepo from "#domain/orders/read.service.ts";
import * as spotsService from "#domain/spots/service.ts";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import query from "#shared/db/query.ts";

await mockSessions();
const { default: app } = await import("#app");

const ROUTES = [
  "generate_packing_list",
  "generate_return_packing_list",
  "generate_invoice",
  "generate_sales_order_invoice",
];

// getAllPurchases/getAllSales declare Record<string, unknown>[]; what this file reads is named rather than assumed.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; order_items?: unknown[] | null };
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

let customer: UserFixture;
let order: OrderFixture;
let spots: Spot[];
let salesOrder: OrderFixture;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user");

  const orders = (await poRepo.getAllPurchases()) as unknown as OrderFixture[];
  order = orders.find((o) => (o.order_items?.length ?? 0) > 0) ?? orders[0];
  assert.ok(order, "dev has no purchase order to render");

  // The composed shape (name/ask/bid), the way the frontend sends them and the calculations read them.
  spots = await spotsService.getSpotPrices();

  // The sales-order invoice is a different document from a different table (the refiner's copy) - `order` above is a purchase order and won't stand in for it.
  const salesOrders = (await soRepo.getAllSales()) as unknown as OrderFixture[];
  salesOrder = salesOrders.find((o) => (o.order_items?.length ?? 0) > 0) ?? salesOrders[0];
  assert.ok(salesOrder, "dev has no sales order to render");
  assert.ok(spots.length > 0, "dev has no spot prices");
});

after(async () => {
  // Otherwise Chromium outlives the test run and node never exits.
  await closeBrowser();
  restoreSessions();
  await pool.end();
});

// The other three, which only had the refusal until now: a return packing list, a purchase-order invoice and a sales-order invoice - the documents a customer and a refiner are sent.
// Each renders LIVE here from the server's own read: `customer` is generally not the order's owner, so serve.ts keeps the store shut and falls back to a render. Nothing else would notice the renderer breaking, which is what makes rendering them worth asserting rather than assuming.
// A PDF is checked by its magic bytes and a floor on its length - an empty or error page is still a 200 with content-type application/pdf, so the status alone proves nothing.
const RENDERS = [
  ["generate_return_packing_list", "return-packing-list.pdf", () => ({ order_id: order.id })],
  ["generate_invoice", "invoice.pdf", () => ({ order_id: order.id })],
  ["generate_sales_order_invoice", "invoice.pdf", () => ({ order_id: salesOrder.id })],
];

// Declared as a tuple list - inferred, the element type collapses to `string | (() => …)` and neither half is usable.
for (const [route, filename, body] of RENDERS as Array<
  [string, string, () => Record<string, unknown>]
>) {
  test(`${route} renders a real PDF`, async () => {
    await inPinnedTransaction(async () => {
      await as({ ...customer, role: "user" }, async () => {
        const res = await request(app)
          .post(`/api/pdf/${route}`)
          .send(body())
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
    });
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
  });
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
  });
});

// The one that renders: proves a signed-in caller receives a real file with the headers a browser needs to save it.
test("a signed-in caller gets a real PDF with the headers to download it", async () => {
  await inPinnedTransaction(async () => {
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
  });
});

// The stored branch, over HTTP: serve.test.ts proves the selection logic with a stubbed reader; what it can't prove is the wiring (that the controller hands serve.ts the right order id and caller, and that a stored row can never turn a customer's download into a 500).
// In a test run the stored read always fails (like a deleted object would), so this drives the OWNER through a route whose order HAS a stored row and asserts the fallback still delivers a real PDF - "download must not break over bookkeeping", end to end.
test("an owner's download with a stored row still answers with a PDF when the store cannot", async () => {
  await inPinnedTransaction(async () => {
    // The row references orders.orders; an order the schema doesn't know can't carry one, and this test would prove nothing - so say so.
    const known = await outside(`SELECT user_id FROM orders.orders WHERE id = $1`, [order.id]);
    assert.ok(known.length, "the fixture order is not in orders.orders - pick another");
    const ownerRow = await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
      known[0].user_id,
    ]);
    assert.ok(ownerRow.length, "the order's owner is not in exchange.users");

    // Through the shared executor: while pinned, this joins the transaction that gets rolled back, so the row never outlives the test.
    await query(
      `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum)
       VALUES ('return_packing_list', $1, 'pdfs/replay/never-uploaded.pdf', 5, 'feed')`,
      [order.id]
    );

    await as({ ...(ownerRow[0] as UserFixture), role: "user" }, async () => {
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
  });
});
