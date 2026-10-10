import { validateEnv } from '#shared/env/validate.ts'

validateEnv()

const { default: app } = await import('#app')
const { setupScheduler } = await import('#shared/cron/scheduler.ts')
const { getSettings } = await import('#pricing/spots/service.ts')

const PORT = process.env.PORT || 5000

setupScheduler((await getSettings()).tick_seconds)

app.listen(PORT, () => {})
