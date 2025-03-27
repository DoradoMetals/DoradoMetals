const cron = require("node-cron");
const { updateSpotPrices } = require("../controllers/spotController");

function setupScheduler() {
  updateSpotPrices();

  cron.schedule(process.env.SPOT_UPDATE_SCHEDULE, async () => {
    await updateSpotPrices();
  });
}

module.exports = { setupScheduler };
