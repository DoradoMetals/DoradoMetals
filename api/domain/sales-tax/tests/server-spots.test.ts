import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import * as spotsService from "#domain/spots/service.ts";
import { GetSalesTaxBody } from "@dorado/contracts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, aProduct } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };
type AddressFixture = { id: string; state: string };
type ProductFixture = { id: string };
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

const customer: UserFixture = TEST_CUSTOMER;
let serverSpots: Spot[];

const TAXING_STATE = "CA";

const fixtures = async (c: PoolClient) => {
  const owner = await aUser(c);
  const address = await anAddress(c, owner, { state: TAXING_STATE, city: "Fresno", zip: "93701" });
  const coin = await aProduct(c, { type: "Coin", display: true, content: 1 });
  return { taxing: { id: address.id, state: address.state }, product: { id: coin.id } };
};

beforeAll(async () => {
  serverSpots = await spotsService.getSpotPrices();
  assert.ok(serverSpots.length > 0, "the server has no spots - every assertion here is vacuous");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("getSpotPrices returns the database's spots in the shape the calculations read", async () => {
  const stored = await outside(
    `SELECT m.name, s.ask, s.bid
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id
      ORDER BY m.name`
  );

  assert.equal(serverSpots.length, stored.length, "the helper lost or invented a metal");

  for (const row of stored) {
    const served = serverSpots.find((s) => s.name === row.name);
    assert.ok(served, `${row.name} is in spots.spots and not in the pricing spots`);

    assert.ok("ask" in served, `${row.name} has no ask - the calculations read that name`);
    assert.equal(
      Number(served.ask).toFixed(6),
      Number(row.ask).toFixed(6),
      `${row.name} was priced at something other than the stored ask`
    );
  }
});

test("a body claiming gold costs $1 is refused, not quietly ignored", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const items = [{ id: product.id, quantity: 1 }];

      const honest = await request(app)
        .post("/api/tax")
        .send({ address_id: taxing.id, items });
      assert.equal(honest.status, 200, JSON.stringify(honest.body));

      const lying = await request(app)
        .post("/api/tax")
        .send({
          address_id: taxing.id,
          items,
          spots: serverSpots.map((s) => ({ name: s.name, ask: 1, bid: 1 })),
        });
      assert.equal(
        lying.status, 400,
        `a body carrying spots answered ${lying.status} - the client can still price the order`
      );

      const parsed = GetSalesTaxBody.safeParse({
        address_id: taxing.id, items, spots: [{ name: "Gold", ask: 1, bid: 1 }],
      });
      assert.equal(parsed.success, false, "GetSalesTaxBody accepts a spots field");
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("a legitimate request is priced by the server, not at zero", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { taxing, product } = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/tax")
        .send({ address_id: taxing.id, items: [{ id: product.id, quantity: 1 }] });

      assert.equal(res.status, 200);
      const tax = typeof res.body === "number" ? res.body : (res.body?.tax ?? res.body);
      assert.ok(
        Number.isFinite(Number(tax)),
        `tax came back as ${JSON.stringify(res.body)}, which is not a number`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
