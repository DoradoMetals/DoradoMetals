import axios from "axios";
import * as spotRepo from "#features/spots/repo.js";

export async function getSpotPrices() {
  return spotRepo.getAll();
}

// Pulls the upstream quote feed and writes it to exchange.metals. Called by the
// scheduler on startup and on the SPOT_UPDATE_SCHEDULE cron.
export async function updateSpotPrices() {
  const response = await axios.get(process.env.SPOT_API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DoradoMetalsExchange/1.0",
    },
  });

  const quotes = {};

  for (const metal of response.data) {
    const name = metal.data?.symbol?.trim();
    const bid = metal.data?.bid;
    const ask = metal.data?.ask;

    if (!name || bid == null || ask == null) continue;

    quotes[name] = {
      ask: Number(ask.toFixed(2)),
      bid: Number(bid.toFixed(2)),
      percentChange: Number(metal.data?.oneDayPercentChange?.toFixed(2) ?? 0),
      dollarChange: Number(metal.data?.oneDayChange?.toFixed(2) ?? 0),
    };
  }

  await spotRepo.updateQuotes(quotes);
  return quotes;
}

export const getAllMetals = () => spotRepo.getAllMetals();
