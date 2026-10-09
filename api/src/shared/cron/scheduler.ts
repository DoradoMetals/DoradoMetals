import { sweepAbandoned, sweepSettledIntentsNow } from '#transactions/sweeps.ts'
import { sweepAnonymousVisitorsNow } from '#checkout/sweep.ts'
import { reportError } from '#shared/observability/report.ts'
import cron from 'node-cron'
import { logger } from '#shared/logging/logger.ts'

import { updateSpotPrices } from '#pricing/spots/service.ts'
import { sendTomorrowsReminders } from '#documents/emails/service.ts'

export const ABANDONED_AFTER_HOURS = 24

export const everySeconds = (seconds: number): string =>
  seconds < 60 ? `*/${seconds} * * * * *` : `0 */${Math.round(seconds / 60)} * * * *`

type Job = {
  name: string
  schedule: string | undefined
  run: () => Promise<unknown>
}

export const jobs = (tick_seconds: number | null): Job[] => [
  {
    name: 'spot prices',
    schedule: tick_seconds === null ? undefined : everySeconds(tick_seconds),
    run: updateSpotPrices,
  },
  {
    name: 'anonymous visitors',
    schedule: process.env.ANONYMOUS_SWEEP_SCHEDULE,
    run: async () => {
      await sweepAnonymousVisitorsNow()
    },
  },
  {
    name: 'appointment reminders',
    schedule: process.env.APPOINTMENT_REMINDER_SCHEDULE,
    run: async () => {
      await sendTomorrowsReminders()
    },
  },
  {
    name: 'reconcile payments',
    schedule: process.env.PAYMENT_RECONCILE_SCHEDULE,
    run: async () => {
      await sweepSettledIntentsNow()
      await sweepAbandoned(ABANDONED_AFTER_HOURS)
    },
  },
]

async function runJob({ name, run }: Job): Promise<void> {
  try {
    await run()
  } catch (err) {
    reportError({
      at: `cron.${name}`,
      message:
        `the ${name} cron job failed and the schedule carried on. Nothing ` +
        `retries it before its next tick`,
      err,
      extra: { job: name },
    })
  }
}

export function setupScheduler(tick_seconds: number | null): void {
  for (const job of jobs(tick_seconds)) {
    if (!job.schedule) {
      logger.warn(`[CRON] no schedule configured for ${job.name}, skipping`)
      continue
    }

    if (!cron.validate(job.schedule)) {
      logger.warn(`[CRON] invalid schedule for ${job.name}: ${job.schedule}, skipping`)
      continue
    }

    cron.schedule(job.schedule, () => runJob(job))
  }
}
