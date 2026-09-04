import { sweepSettledIntents } from "#domain/payments/sweeps.ts";
import { sweepAnonymousVisitors } from "#domain/checkout/sweep.ts";
import { reportError } from "#shared/observability/report.ts";
import cron from "node-cron";
import { logger } from "#shared/logging/logger.ts";

import { updateSpotPrices } from "#domain/spots/service.ts";

type Job = {
  name: string;
  schedule: string | undefined;
  run: () => Promise<unknown>;
};

// Schedules are read when setupScheduler runs, not at module load — the old module-level array worked only because of import order (app.ts imports #env before server.ts imports the scheduler); swapping those two lines would leave every schedule undefined with no error, just no cron.
// A function body can't be evaluated too early, so this can no longer depend on import order at all. Exported only so a test can prove the call-time read — nothing else imports it, and a test must never invoke `run` (these reach the live spot provider and the database).
export const jobs = (): Job[] => [
  {
    name: "spot prices",
    schedule: process.env.SPOT_UPDATE_SCHEDULE,
    run: updateSpotPrices,
  },
  {
    // Ruling 63 mints an auth.users row for every visitor who touches a basket,
    // and nothing else ever deletes one - the anonymous plugin is configured
    // not to. Idempotent, moves no money, and everything it can reach is
    // device-sync, which is the same test the settled sweep above passes.
    name: "anonymous visitors",
    schedule: process.env.ANONYMOUS_SWEEP_SCHEDULE,
    run: async () => { await sweepAnonymousVisitors(); },
  },
  {
    // Idempotent and moves NO money — the whole reason it's allowed on a timer while the abandonment sweep (cancel + refund) lives only behind reconcile:payments --commit and a human.
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
