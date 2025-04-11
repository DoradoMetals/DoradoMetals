const pool = require("../../db");

const getInboundShipment = async (req, res) => {
  const { order_id } = req.query;

  try {
    const query = `
      SELECT * FROM exchange.inbound_shipments WHERE order_id = $1;
    `;
    const values = [order_id];

    const { rows } = await pool.query(query, values);

    // Manually encode shipping_label to base64 if it's present
    const shipments = rows.map((shipment) => ({
      ...shipment,
      shipping_label: shipment.shipping_label
        ? shipment.shipping_label.toString("base64")
        : null,
    }));

    res.json(shipments);
  } catch (error) {
    console.error("Error fetching shipment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getInboundShipment,
};