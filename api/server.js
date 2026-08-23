// The process: start the scheduler, bind the port.
//
// Everything about the app itself is in app.js, so a test can import it without
// either of these happening.
import app from "#app";
import { setupScheduler } from "#shared/cron/scheduler.js";

const PORT = process.env.PORT || 5000;

setupScheduler();

app.listen(PORT, () => {});
