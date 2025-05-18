const pool = require("../db");
const axios = require("axios");

const getSpotPrices = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, ask_spot, bid_spot, percent_change, dollar_change, scrap_percentage, bullion_percentage
       FROM exchange.metals
       ORDER BY
         CASE type
           WHEN 'Gold' THEN 1
           WHEN 'Silver' THEN 2
           WHEN 'Platinum' THEN 3
           WHEN 'Palladium' THEN 4
           ELSE 5
         END`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching spot prices:", error);
    res.status(500).json({ error: "Failed to fetch spot prices." });
  }
};

const updateScrapPercentages = async (req, res) => {
  const { id, scrap_percentage } = req.body;
  try {
    const query = `
      UPDATE exchange.metals
      SET scrap_percentage = $1
      WHERE id = $2
      RETURNING *;
    `;

    const values = [scrap_percentage, id];

    const result = await pool.query(query, values);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error updating spot price", error);
    res.status(500).json({ error: "Failed to update spot price." });
  }
};

const updateSpotPrices = async () => {
  try {
    const response = await axios.get(process.env.SPOT_API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DoradoMetalsExchange/1.0",
      },
    });

    const spotData = response.data;

    const metals = {};
    for (const metal of spotData) {
      const name = metal.data?.symbol?.trim();
      const bid = metal.data?.bid;
      const ask = metal.data?.ask;
      const percentChange = metal.data?.oneDayPercentChange;
      const dollarChange = metal.data?.oneDayChange;

      if (!name || bid == null || ask == null) {
        continue;
      }

      metals[name] = {
        ask: Number(ask.toFixed(2)),
        bid: Number(bid.toFixed(2)),
        percentChange: Number(percentChange?.toFixed(2) ?? 0),
        dollarChange: Number(dollarChange?.toFixed(2) ?? 0),
      };
    }

    const gold = metals["Gold"];
    const silver = metals["Silver"];
    const platinum = metals["Platinum"];
    const palladium = metals["Palladium"];

    await pool.query(
      `
        UPDATE exchange.metals AS m SET
          ask_spot = c.ask_spot,
          bid_spot = c.bid_spot,
          dollar_change = c.dollar_change,
          percent_change = c.percent_change
        FROM (
          VALUES 
            ('Gold', $1::numeric, $2::numeric, $3::numeric, $4::numeric),
            ('Silver', $5::numeric, $6::numeric, $7::numeric, $8::numeric),
            ('Platinum', $9::numeric, $10::numeric, $11::numeric, $12::numeric),
            ('Palladium', $13::numeric, $14::numeric, $15::numeric, $16::numeric)
        ) AS c(type, ask_spot, bid_spot, dollar_change, percent_change)
        WHERE m.type = c.type;
      `,
      [
        gold?.ask,
        gold?.bid,
        gold?.dollarChange,
        gold?.percentChange,
        silver?.ask,
        silver?.bid,
        silver?.dollarChange,
        silver?.percentChange,
        platinum?.ask,
        platinum?.bid,
        platinum?.dollarChange,
        platinum?.percentChange,
        palladium?.ask,
        palladium?.bid,
        palladium?.dollarChange,
        palladium?.percentChange,
      ]
    );
  } catch (err) {
    console.error("❌ Error updating spot prices:", err.message);
  }
};

module.exports = {
  getSpotPrices,
  updateScrapPercentages,
  updateSpotPrices,
};
