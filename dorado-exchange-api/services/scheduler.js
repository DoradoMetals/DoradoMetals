const cron = require("node-cron");
const { updateSpotPrices } = require("../controllers/spotController");

function setupScheduler() {
  updateSpotPrices();

  cron.schedule("*/10 * * * * *", async () => {
    await updateSpotPrices();
  });
}

module.exports = { setupScheduler };
