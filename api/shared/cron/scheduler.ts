import cron from "node-cron";

import { updateSpotPrices } from "#features/spots/service.ts";

type Job = {
  name: string;
  schedule: string | undefined;
  run: () => Promise<unknown>;
};

// THE SCHEDULES ARE READ WHEN setupScheduler RUNS, NOT WHEN THIS MODULE LOADS.
//
// They used to sit in a module-level array, which worked - checked, rather than
// assumed: app.js imports #env on its eleventh line, server.js imports #app
// before it imports this, so dotenv had always run by the time the array was
// built. Both schedules were populated.
//
// It worked because of the ORDER OF TWO IMPORTS IN server.js. Swap those two
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
];

// Failures are logged and swallowed so one bad run never takes the process down.
async function runJob({ name, run }: Job): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(`[CRON] ${name} failed:`, err);
  }
}

// Each job runs once at startup and then on its cron expression.
export function setupScheduler(): void {
  for (const job of jobs()) {
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
