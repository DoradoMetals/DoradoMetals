// The four PDF routes, over real HTTP.
//
// features/pdf/service.test.js already renders every document and checks the
// bytes. What it cannot check is the HTTP boundary: the guards, and the headers
// a browser needs to actually receive a file. A packing list that renders
// perfectly and arrives with the wrong Content-Type is a broken download.
//
// CHROMIUM. One test here renders for real, because Content-Length can only be
// asserted against a real document. closeBrowser() runs in after() - without it
// Chromium outlives the run and node never exits, which has happened and cost
// an hour and eleven orphaned processes. Every other test stops at a guard, so
// nothing else launches a browser.
//
// WHAT THESE ROUTES DO NOT DO, recorded because it is a reasonable thing to
// look for and its absence is deliberate: they take their content from the
// request body and do not look anything up. That is not the relay problem the
// email routes had - the caller receives the PDF themselves, so supplying their
// own content only produces a document for their own eyes. Nothing is emailed
// and nothing is stored.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { closeBrowser } from "#providers/puppeteer/browser.ts";
import * as poRepo from "#features/purchase-orders/repo.js";
import * as soRepo from "#features/sales-orders/repo.js";
import * as spotsRepo from "#features/spots/repo.js";
import { toLegacy as spotsToLegacy } from "#features/spots/wire.ts";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

const ROUTES = [
  "generate_packing_list",
  "generate_return_packing_list",
  "generate_invoice",
  "generate_sales_order_invoice",
];

let customer;
let order;
let spots;
let salesOrder;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev has no non-admin user");

  const orders = await poRepo.getAll();
  order = orders.find((o) => o.order_items?.length > 0) ?? orders[0];
  assert.ok(order, "dev has no purchase order to render");

  // Legacy-shaped, the way the frontend sends them and the calculations read
  // them. The same conversion service.test.js does, and for the same reason.
  spots = spotsToLegacy(await spotsRepo.getAll());

  // The sales-order invoice is a different document from a different table -
  // it is the copy a REFINER is sent. `order` above is a purchase order and
  // will not stand in for it.
  const salesOrders = await soRepo.getAll();
  salesOrder = salesOrders.find((o) => o.order_items?.length > 0) ?? salesOrders[0];
  assert.ok(salesOrder, "dev has no sales order to render");
  assert.ok(spots.length > 0, "dev has no spot prices");
});

after(async () => {
  // Otherwise Chromium outlives the test run and node never exits.
  await closeBrowser();
  restoreSessions();
  await pool.end();
});

// THE OTHER THREE, WHICH ONLY HAD THE REFUSAL UNTIL NOW.
//
// The loop above drives all four routes anonymously and asserts each refuses.
// Only generate_packing_list was ever RENDERED. These are the three that were
// not: a return packing list, a purchase-order invoice and a sales-order
// invoice - the documents a customer and a refiner are sent.
//
// Each renders entirely from the request body; none reads the database. So
// there is nothing here that could leak stored data, and equally nothing that
// would notice if the renderer stopped working - which is what makes rendering
// them worth asserting rather than assuming.
//
// A PDF is checked by its magic bytes and a floor on its length. An empty or
// error page is still a 200 with content-type application/pdf, so the status
// alone proves nothing.
const RENDERS = [
  [
    "generate_return_packing_list",
    "return-packing-list.pdf",
    () => ({ purchaseOrder: order, spotPrices: spots }),
  ],
  [
    "generate_invoice",
    "invoice.pdf",
    () => ({ purchaseOrder: order, spotPrices: spots, orderSpots: spots }),
  ],
  [
    "generate_sales_order_invoice",
    "invoice.pdf",
    () => ({ salesOrder, spots }),
  ],
];

for (const [route, filename, body] of RENDERS) {
  test(`${route} renders a real PDF`, async () => {
    await inPinnedTransaction(async () => {
      await as({ ...customer, role: "user" }, async () => {
        const res = await request(app)
          .post(`/api/pdf/${route}`)
          .send(body())
          .buffer(true)
          .parse((r, cb) => {
            const chunks = [];
            r.on("data", (c) => chunks.push(c));
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

// A guard that lets an unauthenticated caller through would also be launching a
// browser per request, which is a denial-of-service surface as well as a leak.
// This is what makes the refusals above worth asserting for all four rather
// than for one.
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

// THE ONE THAT RENDERS. Proves a signed-in caller receives a real file with the
// headers a browser needs to save it.
test("a signed-in caller gets a real PDF with the headers to download it", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/pdf/generate_packing_list")
        .send({
          purchaseOrder: order,
          spotPrices: spots,
          packageDetails: { label: "Medium Box" },
        })
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
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
