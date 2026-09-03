// Schedules are read when setupScheduler runs, not at module load — the old module-level array WORKED only because of import order in server.ts (dotenv always ran first); swapping two lines would leave both cron jobs silently unscheduled with no error at all.
// Nothing here calls run() — setupScheduler fires each job immediately, and the two jobs reach the live spot provider and the database; only the schedule strings are read.

import test from "node:test";
import assert from "node:assert/strict";

import { jobs } from "#shared/cron/scheduler.ts";

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
  // The abandonment sweep (cancel + refund) is deliberately NOT scheduled here — it moves money and lives behind reconcile:payments --commit and a human.
  const names = jobs().map((j) => j.name);
  assert.deepEqual(names, ["spot prices", "settle paid orders"]);
  for (const job of jobs()) {
    assert.equal(typeof job.run, "function", `${job.name} has something to run`);
  }
});

test("the schedule is read at CALL time, not at import time", () => {
  const first = withEnv({ SPOT_UPDATE_SCHEDULE: "*/5 * * * *" }, () => jobs());
  assert.equal(first[0].schedule, "*/5 * * * *");

  // The discriminating half: a module-level array could not do this, because it
  // was built once with whatever the environment held at import.
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
  const got = withEnv({ SPOT_UPDATE_SCHEDULE: undefined }, () => jobs());
  for (const job of got) {
    assert.equal(job.schedule, undefined, `${job.name} reports no schedule`);
    // Not the string "undefined", which cron.validate would reject with a
    // confusing message rather than the clear "no schedule configured" skip.
    assert.notEqual(job.schedule, "undefined");
  }
});
