import { test } from "vitest";
import assert from "node:assert/strict";
import { isTestRun } from "#shared/testing/is-test-run.ts";

const withEnvironment = <T>(
  { nodeEnv, execArgv }: { nodeEnv: string | undefined; execArgv: string[] },
  fn: () => T
): T => {
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
  withEnvironment({ nodeEnv: undefined, execArgv: ["--test-reporter=spec"] }, () => {
    assert.equal(isTestRun(), true);
  });
});

test("neither signal means this is not a test run", () => {
  withEnvironment(NEITHER, () => assert.equal(isTestRun(), false));
  withEnvironment({ nodeEnv: undefined, execArgv: [] }, () =>
    assert.equal(isTestRun(), false));
  withEnvironment({ nodeEnv: "development", execArgv: ["--inspect"] }, () =>
    assert.equal(isTestRun(), false));
});

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
