import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { jobs } from "#shared/cron/scheduler.ts";

const SCHEDULE_VARS: string[] = (() => {
  const source = fs.readFileSync(new URL("../scheduler.ts", import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
})();

const cleared = (): Record<string, undefined> =>
  Object.fromEntries(SCHEDULE_VARS.map((name) => [name, undefined]));

const withEnv = <T>(values: Record<string, string | undefined>, fn: () => T): T => {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(values)) {
    previous.set(k, Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test("the jobs are declared, and not invoked by reading them", () => {
  const names = jobs().map((j) => j.name);
  assert.deepEqual(names, ["spot prices", "anonymous visitors", "settle paid orders"]);
  for (const job of jobs()) {
    assert.equal(typeof job.run, "function", `${job.name} has something to run`);
  }
});

test("the schedule is read at CALL time, not at import time", () => {
  const first = withEnv({ SPOT_UPDATE_SCHEDULE: "*/5 * * * *" }, () => jobs());
  assert.equal(first[0].schedule, "*/5 * * * *");

  const second = withEnv(
    { SPOT_UPDATE_SCHEDULE: undefined },
    () => jobs()
  );
  assert.equal(
    second[0].schedule,
    undefined,
    "a variable that has gone away must be seen - this is the case that would " +
      "have left the process running with no cron at all"
  );
});

test("an unset schedule is undefined rather than a string", () => {
  assert.ok(
    SCHEDULE_VARS.length >= jobs().length,
    `found ${SCHEDULE_VARS.length} schedule variable(s) in scheduler.ts for ` +
      `${jobs().length} job(s) - the discovery is wrong, and a scan that ` +
      "clears nothing lets this test pass on the environment's say-so"
  );
  const got = withEnv(cleared(), () => jobs());
  for (const job of got) {
    assert.equal(job.schedule, undefined, `${job.name} reports no schedule`);
    assert.notEqual(job.schedule, "undefined");
  }
});
