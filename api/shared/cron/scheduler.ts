import { sweepSettledIntents } from "#domain/orders/reconcile.service.ts";
import { reportError } from "#shared/observability/report.ts";
import cron from "node-cron";
import { logger } from "#shared/logging/logger.ts";

import { updateSpotPrices } from "#domain/spots/service.ts";

type Job = {
  name: string;
  schedule: string | undefined;
  run: () => Promise<unknown>;
};

// THE SCHEDULES ARE READ WHEN setupScheduler RUNS, NOT WHEN THIS MODULE LOADS.
//
// They used to sit in a module-level array, which worked - checked, rather than
// assumed: app.ts imports #env on its eleventh line, server.ts imports #app
// before it imports this, so dotenv had always run by the time the array was
// built. Both schedules were populated.
//
// It worked because of the ORDER OF TWO IMPORTS IN server.ts. Swap those two
// lines and every schedule reads undefined, both jobs log "no schedule
// configured" and skip, and the process goes on serving traffic with spot
// prices that never update again. Nothing would
// fail; there would just be no cron.
//
// A function body cannot be evaluated too early, so this cannot depend on
// import order at all.
// Exported ONLY so a test can prove the call-time read. Nothing else imports
// it, and a test must never invoke `run` - setupScheduler fires each job
// immediately, and these two reach the live spot provider and the database.
export const jobs = (): Job[] => [
  {
    name: "spot prices",
    schedule: process.env.SPOT_UPDATE_SCHEDULE,
    run: updateSpotPrices,
  },
  {
    // The missed-webhook sweep: sales orders awaiting a payment that already
    // settled get advanced. Idempotent and moves NO money - which is the whole
    // reason it is allowed on a timer while the abandonment sweep (cancel +
    // refund) lives only behind reconcile:payments --commit and a human.
    name: "settle paid orders",
    schedule: process.env.PAYMENT_RECONCILE_SCHEDULE,
    run: async () => { await sweepSettledIntents(); },
  },
];

// Failures are logged and swallowed so one bad run never takes the process down.
async function runJob({ name, run }: Job): Promise<void> {
  try {
    await run();
  } catch (err) {
    reportError({
      at: `cron.${name}`,
      message:
        `the ${name} cron job failed and the schedule carried on. Nothing ` +
        `retries it before its next tick`,
      err,
      extra: { job: name },
    });
  }
}

// Each job runs once at startup and then on its cron expression.
export function setupScheduler(): void {
  for (const job of jobs()) {
    runJob(job);

    if (!job.schedule) {
      logger.warn(`[CRON] no schedule configured for ${job.name}, skipping`);
      continue;
    }

    if (!cron.validate(job.schedule)) {
      logger.warn(
        `[CRON] invalid schedule for ${job.name}: ${job.schedule}, skipping`
      );
      continue;
    }

    cron.schedule(job.schedule, () => runJob(job));
  }
}
