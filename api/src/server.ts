import app from '#app'
import { setupScheduler } from '#shared/cron/scheduler.ts'
import { getSettings } from '#pricing/spots/service.ts'

const PORT = process.env.PORT || 5000

setupScheduler((await getSettings()).tick_seconds)

app.listen(PORT, () => {})
