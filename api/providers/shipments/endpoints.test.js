// The sandbox switch, which has to be exercisable to be worth having.
//
// Every value is read per call rather than captured at import, and these tests
// are the reason: the first version captured FEDEX_ENV at module load and
// claimed in a comment that a test could flip it. It could not. This file is
// what makes that claim true.
//
// No network. Nothing here calls FedEx - it asserts which host and which
// account a call would use.
// #env first. Without it none of the FEDEX_* variables exist in a test process,
// and the first version of this file passed three tests by comparing undefined
// to undefined - the switch would have been reported working with no
// configuration present at all.
import "#env";
import test, { afterEach, before } from "node:test";
import assert from "node:assert/strict";
import {
  accountNumber,
  trackingAccountNumber,
  activeEnvironment,
  apiBase,
} from "#providers/shipments/endpoints.ts";

const saved = { ...process.env };

// And the values have to actually be there, or every assertion below is
// undefined === undefined again.
before(() => {
  for (const name of [
    "FEDEX_API_URL",
    "FEDEX_SANDBOX_API_URL",
    "FEDEX_ACCOUNT_NUMBER",
    "FEDEX_SANDBOX_ACCOUNT_NUMBER",
    "FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER",
  ]) {
    assert.ok(process.env[name], `${name} is not set - these tests would pass vacuously`);
  }
});

afterEach(() => {
  process.env.FEDEX_ENV = saved.FEDEX_ENV;
  if (saved.FEDEX_ENV === undefined) delete process.env.FEDEX_ENV;
});

test("the default is production, not sandbox", () => {
  delete process.env.FEDEX_ENV;
  assert.equal(activeEnvironment(), "production");
  assert.equal(apiBase(), process.env.FEDEX_API_URL);
  assert.equal(accountNumber(), process.env.FEDEX_ACCOUNT_NUMBER);
});

// A switch that silently redirected live traffic to a sandbox would be far
// worse than one that has to be turned on, so anything unrecognised is
// production too.
test("anything other than the word sandbox is production", () => {
  for (const value of ["", "prod", "SANDBOX", "test", "true"]) {
    process.env.FEDEX_ENV = value;
    assert.equal(activeEnvironment(), "production", `FEDEX_ENV=${value} selected the sandbox`);
  }
});

test("sandbox selects the sandbox host and the sandbox account", () => {
  process.env.FEDEX_ENV = "sandbox";
  assert.equal(activeEnvironment(), "sandbox");
  assert.equal(apiBase(), process.env.FEDEX_SANDBOX_API_URL);
  assert.equal(accountNumber(), process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER);
  assert.equal(trackingAccountNumber(), process.env.FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER);
});

// The account number is the half that fails confusingly. Pointing at the
// sandbox host with the live account is refused for permissions, which says
// nothing about the environment being wrong.
test("the sandbox account is a different account from the live one", () => {
  process.env.FEDEX_ENV = "sandbox";
  const sandboxAccount = accountNumber();
  process.env.FEDEX_ENV = "production";
  assert.notEqual(
    sandboxAccount,
    accountNumber(),
    "the two environments share an account number - one of them is misconfigured"
  );
});

// The payload builders have to follow the switch too, or a sandbox request is
// built naming the live account.
test("a built payload carries the account the switch selected", async () => {
  const { createShipmentPayload } = await import("#providers/shipments/payloads.ts");
  const input = {
    shipper: { contact: {}, address: {} },
    recipient: { contact: {}, address: {} },
    pkg: { weight: { units: "LB", value: 1 }, dimensions: {} },
  };

  process.env.FEDEX_ENV = "sandbox";
  const sandboxPayload = JSON.stringify(createShipmentPayload(input));
  assert.ok(
    sandboxPayload.includes(process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER),
    "a sandbox label was built against the live account"
  );

  process.env.FEDEX_ENV = "production";
  const livePayload = JSON.stringify(createShipmentPayload(input));
  assert.ok(livePayload.includes(process.env.FEDEX_ACCOUNT_NUMBER));
});
