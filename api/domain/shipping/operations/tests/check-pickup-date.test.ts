// readyDate arrives as a string, and the FedEx provider wants a Date - JSON can't carry a Date, and two provider functions (pickupAvailabilityPayload's formatFedexTime, parsePickupAvailability) both call Date methods on it. The controller converts at the boundary, where a request stops being JSON.
// The happy path can't be asserted over HTTP at all: fetchAccessToken refuses during a test run unless FEDEX_ENV=sandbox, and checkPickup fetches the token before building the payload - so with the fix reverted, the route stops at the carrier refusal before ever reaching getHours. A first version asserted exactly that and passed identically before and after the fix. The test on the pure function below is where the requirement actually lives.
// The two refusal tests DO discriminate: with the guard removed they answer 500 instead of 400 - verified by reverting the whole fix, not half of it, since removing only the assignment and leaving the guard left a control that passed and told nothing.
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

// THE STRUCTURAL SUBSET THE SESSION ACTUALLY NEEDS.
type UserFixture = { id: string; name: string | null; email: string | null };

// THE CARRIER IS NAMED AND THE ADDRESS IS BUILT (lane 1) - the distinction the
// fixture library draws. `shipping.carriers` is seeded reference data and FDXE
// below is FedEx's own service code, so naming FedEx is the literal these
// tests mean; an address belongs to a person, and `SELECT id FROM
// places.addresses LIMIT 1` pointed this pickup check at somebody's house.
//
// Both are resolved INSIDE the pin, because that is where the request runs.
const customer: UserFixture = TEST_CUSTOMER;

const fixtures = async (c: PoolClient) => ({
  carrier_id: await carrierId(c, "FedEx"),
  address_id: (await anAddress(c, await aUser(c))).id,
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Exactly what frontend/features/checkout/.../shippingStep.tsx sends.
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

  // The string the frontend sends, handed straight to the provider - the state
  // this route was in.
  assert.throws(
    () =>
      payloads.pickupAvailabilityPayload({
        pickupAddress: address,
        code: "FDXE",
        // DELIBERATELY a string where a Date is declared: the signature already forbids the value that broke this route (getHours on a string), which is the whole argument for typechecking the tests - this call was invisible to tsc as JavaScript.
        // @ts-expect-error - a string is exactly what the defect supplied
        readyDate: asTheFrontendSendsIt(),
      }),
    /getHours is not a function/,
    "a string no longer reaches a Date method - if this stops throwing, the " +
      "provider has changed and the controller's conversion may be unnecessary"
  );

  // And what the controller now hands it.
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

// 422, not 400 (D214 item 11): a string that parses (satisfies the contract's
// z.string()) but does not make a Date is a DOMAIN refusal now
// (shared/errors.ts Invalid), not a hand-thrown 400 - the shape passed
// transport, the business rule failed after.
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

// STILL 400: an absent field never reaches the domain - the contract's
// z.string() refuses it at the transport boundary.
test("a missing readyDate is refused too, rather than becoming Invalid Date", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const ids = await fixtures(c);
    await as({ ...customer, role: "user" }, async () => {
      const res = await check(ids, undefined);
      assert.equal(res.status, 400, `a missing readyDate was answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
