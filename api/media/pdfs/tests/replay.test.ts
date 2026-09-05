import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as spotsService from "#pricing/spots/service.ts";
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
  spots = await spotsService.getSpotPrices();
  assert.ok(spots.length > 0, "dev has no spot prices");
});

afterAll(async () => {
  await closeBrowser();
  restoreSessions();
  await pool.end();
});

const RENDERS = [
  ["generate_return_packing_list", "return-packing-list.pdf", "purchase"],
  ["generate_invoice", "invoice.pdf", "purchase"],
  ["generate_sales_order_invoice", "invoice.pdf", "sale"],
];

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

test("an owner's download with a stored row still answers with a PDF when the store cannot", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner } = await anOrderToRender(c, "purchase");

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
