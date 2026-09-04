import app from "#app";
import { setupScheduler } from "#shared/cron/scheduler.ts";

const PORT = process.env.PORT || 5000;

setupScheduler();

app.listen(PORT, () => {});
