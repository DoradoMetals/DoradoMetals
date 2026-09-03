// readyDate arrives as a string, and the FedEx provider wants a Date.
//
// WHY THIS FILE EXISTS. POST /api/shipping/check_pickup answered 500 on every
// call. JSON cannot carry a Date, and the frontend sends
// `new Date().toISOString().split("T")[0]` - a date-only STRING - which reached
// two provider functions that both treat it as a Date:
// pickupAvailabilityPayload calls formatFedexTime(d), reading d.getHours(), and
// parsePickupAvailability calls d.getTime(). 94b99e15 converts it at the
// controller, which is the boundary where a request stops being JSON.
//
// WHAT THE ROUTE CAN AND CANNOT SHOW, established by trying it. Every outbound
// FedEx request goes through fetchAccessToken, which refuses during a test run
// unless FEDEX_ENV=sandbox - deliberately, with no escape hatch. And
// fedex.checkPickup fetches the token BEFORE it builds the payload.
//
// So the happy path cannot be asserted over HTTP at all: with the fix reverted,
// the route still stops at the carrier refusal and never reaches getHours. My
// first version of this file asserted exactly that and passed identically
// before and after the fix - a test that cannot fail. It is replaced below by
// one on the pure function, which is where the requirement actually lives.
//
// The two refusal tests DO discriminate: with the guard removed they answer 500
// instead of 400, and both fail. Verified by reverting the whole fix, not half
// of it - my first attempt removed only the assignment and left the guard, so
// the control passed and told me nothing.
import test, { after, before } from "node:test";
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

before(async () => {
  customer = (
    await outside<UserFixture>(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(customer, "dev has no non-admin user");

  carrier = (await outside<CarrierFixture>(`SELECT id FROM exchange.carriers LIMIT 1`))[0];
  assert.ok(carrier, "dev has no carrier - the route would refuse before the date mattered");
});

after(async () => {
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
        // DELIBERATELY A STRING WHERE A Date IS DECLARED, and pinned from both
        // sides. This is the bug the route had: the frontend's ISO string went
        // straight to formatFedexTime, which calls getHours on it. The
        // signature ALREADY FORBIDS the value that broke it - which is the
        // whole argument for typechecking the tests, since this call was
        // invisible to tsc as JavaScript.
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
