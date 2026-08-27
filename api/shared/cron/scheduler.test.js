// The schedules are read when setupScheduler runs, not when the module loads.
//
// This is the whole point of the change it guards. The schedules used to be a
// module-level array, which WORKED - app.js imports #env on its eleventh line
// and server.js imports #app before it imports the scheduler, so dotenv had
// always run first. It worked because of the order of two import lines.
//
// Swap them and every schedule reads undefined, both jobs log "no schedule
// configured" and skip, and the process serves traffic with spot prices that
// never update again and offers that never expire. Nothing fails. There is
// just no cron.
//
// NOTHING HERE CALLS run(). setupScheduler fires each job immediately, and the
// two jobs are updateSpotPrices and expireStaleOffers - the live spot provider
// and a write to the database. Only the schedule strings are read.

import test from "node:test";
import assert from "node:assert/strict";

import { jobs } from "#shared/cron/scheduler.ts";

const withEnv = (values, fn) => {
  const previous = new Map();
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

test("the job is declared, and not invoked by reading it", () => {
  // 086 removed offers, and the stale-offers job went with them - an offer
  // that cannot exist cannot expire. Spot prices are the one remaining cron.
  const names = jobs().map((j) => j.name);
  assert.deepEqual(names, ["spot prices"]);
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
