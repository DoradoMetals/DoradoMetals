// Schedules are read when setupScheduler runs, not at module load — the old module-level array WORKED only because of import order in server.ts (dotenv always ran first); swapping two lines would leave both cron jobs silently unscheduled with no error at all.
// Nothing here calls run() — setupScheduler fires each job immediately, and the two jobs reach the live spot provider and the database; only the schedule strings are read.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { jobs } from "#shared/cron/scheduler.ts";

// EVERY SCHEDULE VARIABLE THE SCHEDULER READS, discovered from its own source
// rather than listed here.
//
// *** WHY IT IS NOT A LIST. *** The "unset" test below asserts something about
// EVERY job, and it used to arrange that state by clearing ONE variable -
// which worked only for as long as no other schedule happened to be set in
// api/.env. ANONYMOUS_SWEEP_SCHEDULE being set there (as it is in every real
// environment) failed it, and the failure was about the environment rather
// than about the code. Reading the names off scheduler.ts means a job added
// tomorrow is covered without anyone remembering to come here, and a test that
// depends on what a developer's .env happens to hold cannot come back.
const SCHEDULE_VARS: string[] = (() => {
  const source = fs.readFileSync(new URL("../scheduler.ts", import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
})();

// Nothing else in this file can be trusted if the discovery found nothing - a
// scan that matches no variable clears no variable, and the test below would
// then pass against whatever the environment already said.
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
  // The abandonment sweep (cancel + refund) is deliberately NOT scheduled here — it moves money and lives behind reconcile:payments --commit and a human.
  const names = jobs().map((j) => j.name);
  assert.deepEqual(names, ["spot prices", "anonymous visitors", "settle paid orders"]);
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
  // THE ARRANGEMENT IS THE ASSERTION'S SCOPE. Every job is checked, so every
  // job's variable is cleared first - never one of them, and never on the
  // assumption that the others happen to be absent from this machine's .env.
  assert.ok(
    SCHEDULE_VARS.length >= jobs().length,
    `found ${SCHEDULE_VARS.length} schedule variable(s) in scheduler.ts for ` +
      `${jobs().length} job(s) - the discovery is wrong, and a scan that ` +
      "clears nothing lets this test pass on the environment's say-so"
  );
  const got = withEnv(cleared(), () => jobs());
  for (const job of got) {
    assert.equal(job.schedule, undefined, `${job.name} reports no schedule`);
    // Not the string "undefined", which cron.validate would reject with a
    // confusing message rather than the clear "no schedule configured" skip.
    assert.notEqual(job.schedule, "undefined");
  }
});
