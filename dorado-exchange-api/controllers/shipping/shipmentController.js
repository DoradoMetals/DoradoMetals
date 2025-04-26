const pool = require("../../db");
const { updateFedexShipmentTracking } = require("./trackingController");

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

const getInboundShipmentTracking = async (req, res) => {
  const { tracking_number, shipment_id, shipment_start, shipment_end } = req.body;

  try {
    await updateFedexShipmentTracking(
      shipment_start,
      shipment_end,
      tracking_number,
      shipment_id,
      null // outbound_shipment
    );

    const query = `
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'status', e.status,
            'location', e.location,
            'scan_time', e.scan_time
          )
          ORDER BY e.scan_time ASC
        ) AS scan_events
      FROM exchange.inbound_shipments s
      LEFT JOIN exchange.shipment_tracking_events e
        ON s.id = e.inbound_shipment_id
      WHERE s.id = $1
      GROUP BY s.id
    `;

    const { rows } = await pool.query(query, [shipment_id]);

    res.json(rows[0]);
  } catch (error) {
    console.error("Error fetching inbound shipment tracking:", error);
    res.status(500).json({ error: "Failed to fetch tracking data." });
  }
};

module.exports = {
  getInboundShipment,
  getInboundShipmentTracking,
};
