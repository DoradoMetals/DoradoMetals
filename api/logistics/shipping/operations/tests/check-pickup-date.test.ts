import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress, carrierId } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

const customer: UserFixture = TEST_CUSTOMER;

const fixtures = async (c: PoolClient) => ({
  carrier_id: await carrierId(c, "FedEx"),
  address_id: (await anAddress(c, await aUser(c))).id,
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const asTheFrontendSendsIt = () => new Date().toISOString().split("T")[0];

const check = (
  { carrier_id, address_id }: { carrier_id: string; address_id: string },
  readyDate: string | undefined
) =>
  request(app)
    .post("/api/shipping/check_pickup")
    .send({ carrier_id, address_id, code: "FDXE", readyDate });

test("the payload builder needs a Date, which is why the controller converts", async () => {
  const payloads = await import("#providers/shipments/payloads.ts");
  const address = { streetLines: ["1 Test St"], city: "Dallas" };

  assert.throws(
    () =>
      payloads.pickupAvailabilityPayload({
        pickupAddress: address,
        code: "FDXE",
        // @ts-expect-error - a string is exactly what the defect supplied
        readyDate: asTheFrontendSendsIt(),
      }),
    /getHours is not a function/,
    "a string no longer reaches a Date method - if this stops throwing, the " +
      "provider has changed and the controller's conversion may be unnecessary"
  );

  const built = payloads.pickupAvailabilityPayload({
    pickupAddress: address,
    code: "FDXE",
    readyDate: new Date(asTheFrontendSendsIt()),
  });
  assert.match(
    String(built.packageReadyTime),
    /^\d{2}:\d{2}:\d{2}$/,
    "a Date did not produce a time"
  );
});

test("a readyDate that is not a date is refused with a 422 naming it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const ids = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await check(ids, "not-a-date");
      assert.equal(res.status, 422, `an unparseable readyDate was answered ${res.status}`);
      assert.match(String(res.body?.error?.message ?? ""), /readyDate/);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("a missing readyDate is refused too, rather than becoming Invalid Date", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const ids = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await check(ids, undefined);
      assert.equal(res.status, 400, `a missing readyDate was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
