// readyDate arrives as a string, and the FedEx provider wants a Date - JSON can't carry a Date, and two provider functions (pickupAvailabilityPayload's formatFedexTime, parsePickupAvailability) both call Date methods on it. The controller converts at the boundary, where a request stops being JSON.
// The happy path can't be asserted over HTTP at all: fetchAccessToken refuses during a test run unless FEDEX_ENV=sandbox, and checkPickup fetches the token before building the payload - so with the fix reverted, the route stops at the carrier refusal before ever reaching getHours. A first version asserted exactly that and passed identically before and after the fix. The test on the pure function below is where the requirement actually lives.
// The two refusal tests DO discriminate: with the guard removed they answer 500 instead of 400 - verified by reverting the whole fix, not half of it, since removing only the assignment and leaving the guard left a control that passed and told nothing.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS.
type UserFixture = { id: string; name: string | null; email: string | null };
type CarrierFixture = { id: string };

let customer: UserFixture;
let carrier: CarrierFixture;

beforeAll(async () => {
  customer = (
    await outside<UserFixture>(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(customer, "dev has no non-admin user");

  carrier = (await outside<CarrierFixture>(`SELECT id FROM exchange.carriers LIMIT 1`))[0];
  assert.ok(carrier, "dev has no carrier - the route would refuse before the date mattered");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Exactly what frontend/features/checkout/.../shippingStep.tsx sends.
const asTheFrontendSendsIt = () => new Date().toISOString().split("T")[0];

const check = (readyDate: string | undefined) =>
  request(app)
    .post("/api/shipping/check_pickup")
    .send({
      carrier_id: carrier.id,
      pickupAddress: { streetLines: ["1 Test St"], city: "Dallas", stateOrProvinceCode: "TX", postalCode: "75201", countryCode: "US" },
      code: "FDXE",
      readyDate,
    });

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

test("a readyDate that is not a date is refused with a 400 naming it", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await check("not-a-date");
      assert.equal(res.status, 400, `an unparseable readyDate was answered ${res.status}`);
      assert.match(String(res.body?.error?.message ?? ""), /readyDate/);
    });
  });
});

test("a missing readyDate is refused too, rather than becoming Invalid Date", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await check(undefined);
      assert.equal(res.status, 400, `a missing readyDate was answered ${res.status}`);
    });
  });
});
