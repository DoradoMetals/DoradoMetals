// isTestRun is the guard the mail transport, the FedEx client and the Stripe
// client all ask before reaching a live third party. Its whole design is in one
// sentence: EVALUATED WHEN ASKED, NEVER CACHED.
//
// That matters because the bug it was written for is invisible. Each guard used
// to compute the answer once at module scope, and ES module imports are
// HOISTED - so a script whose first statement is `process.env.NODE_ENV = "test"`
// sets it AFTER every imported module has evaluated. The guard captured
// `undefined`, decided this was not a test, and built the real transport.
// seed-e2e-users.mjs did exactly that and reached Gmail; it failed on
// credentials rather than on the guard, which is luck.
//
// So the test that earns its keep is not "returns true under NODE_ENV=test" -
// it is that the answer CHANGES between two calls when the environment changes
// between them. A cached implementation passes every other test here.
import test from "node:test";
import assert from "node:assert/strict";
import { isTestRun } from "#shared/testing/is-test-run.ts";

// This suite runs under NODE_ENV=test AND `node --test`, so both detectors are
// live by default. Every case has to neutralise both and reinstate them, or it
// is asserting the harness rather than the function.
const withEnvironment = ({ nodeEnv, execArgv }, fn) => {
  const hadEnv = Object.prototype.hasOwnProperty.call(process.env, "NODE_ENV");
  const beforeEnv = process.env.NODE_ENV;
  const beforeArgv = process.execArgv;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  process.execArgv = execArgv;
  try { return fn(); } finally {
    if (hadEnv) process.env.NODE_ENV = beforeEnv;
    else delete process.env.NODE_ENV;
    process.execArgv = beforeArgv;
  }
};

const NEITHER = { nodeEnv: "production", execArgv: [] };

test("the harness really does satisfy both detectors", () => {
  // A control: if this fails, every other case here is measuring nothing.
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(isTestRun(), true);
});

test("NODE_ENV=test alone is enough", () => {
  withEnvironment({ nodeEnv: "test", execArgv: [] }, () => {
    assert.equal(isTestRun(), true);
  });
});

test("a --test flag alone is enough, with NODE_ENV unset", () => {
  withEnvironment({ nodeEnv: undefined, execArgv: ["--test"] }, () => {
    assert.equal(isTestRun(), true);
  });
  // the real flags node passes look like --test-reporter, and startsWith
  // catches those too - which is the point of matching a prefix
  withEnvironment({ nodeEnv: undefined, execArgv: ["--test-reporter=spec"] }, () => {
    assert.equal(isTestRun(), true);
  });
});

test("neither signal means this is not a test run", () => {
  withEnvironment(NEITHER, () => assert.equal(isTestRun(), false));
  withEnvironment({ nodeEnv: undefined, execArgv: [] }, () =>
    assert.equal(isTestRun(), false));
  // NODE_ENV=development is not "test", and --inspect is not --test
  withEnvironment({ nodeEnv: "development", execArgv: ["--inspect"] }, () =>
    assert.equal(isTestRun(), false));
});

// THE ONE THAT MATTERS. A module-scope constant passes every case above and
// fails this one, because it answers from the environment as it was at import
// time rather than as it is now.
test("the answer is recomputed on every call, never cached at import", () => {
  withEnvironment(NEITHER, () => {
    assert.equal(isTestRun(), false, "precondition: not a test run");
    process.env.NODE_ENV = "test";
    assert.equal(isTestRun(), true, "must notice NODE_ENV changing after import");
    process.env.NODE_ENV = "production";
    assert.equal(isTestRun(), false, "and must notice it changing back");
    process.execArgv = ["--test"];
    assert.equal(isTestRun(), true, "must notice execArgv changing after import");
  });
});
