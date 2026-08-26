import cron from "node-cron";
import { updateSpotPrices } from "#features/spots/service.ts";
import { expireStaleOffers } from "#features/purchase-orders/service.ts";

// Each job runs once at startup and then on its cron expression. Failures are
// logged and swallowed so one bad run never takes the process down.
const JOBS = [
  {
    name: "spot prices",
    schedule: process.env.SPOT_UPDATE_SCHEDULE,
    run: updateSpotPrices,
  },
  {
    name: "stale offers",
    schedule: process.env.STALE_OFFERS_UPDATE_SCHEDULE,
    run: expireStaleOffers,
  },
];

async function runJob({ name, run }) {
  try {
    await run();
  } catch (err) {
    console.error(`[CRON] ${name} failed:`, err);
  }
}

export function setupScheduler() {
  for (const job of JOBS) {
    runJob(job);

    if (!job.schedule) {
      console.error(`[CRON] no schedule configured for ${job.name}, skipping`);
      continue;
    }

    if (!cron.validate(job.schedule)) {
      console.error(
        `[CRON] invalid schedule for ${job.name}: ${job.schedule}, skipping`
      );
      continue;
    }

    cron.schedule(job.schedule, () => runJob(job));
  }
}
