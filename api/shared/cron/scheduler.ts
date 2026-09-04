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

export const jobs = (): Job[] => [
  {
    name: "spot prices",
    schedule: process.env.SPOT_UPDATE_SCHEDULE,
    run: updateSpotPrices,
  },
  {
    name: "anonymous visitors",
    schedule: process.env.ANONYMOUS_SWEEP_SCHEDULE,
    run: async () => { await sweepAnonymousVisitors(); },
  },
  {
    name: "settle paid orders",
    schedule: process.env.PAYMENT_RECONCILE_SCHEDULE,
    run: async () => { await sweepSettledIntents(); },
  },
];

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
