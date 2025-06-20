const pool = require("../db");

async function insertShipment(
  purchase_order_id,
  sales_order_id,
  tracking_number,
  carrier_id,
  status,
  label,
  labelType,
  pickupType,
  package,
  service,
  netCharge,
  insured,
  declaredValue,
  type,
  client
) {
  const query = `
    INSERT INTO exchange.shipments (
      purchase_order_id,
      sales_order_id,
      tracking_number,
      carrier_id,
      shipping_status,
      shipping_label,
      label_type,
      pickup_type,
      package,
      service_type,
      net_charge,
      insured,
      declared_value,
      type
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *;
  `;

  const vals = [
    purchase_order_id,
    sales_order_id,
    tracking_number,
    carrier_id,
    status,
    label,
    labelType,
    pickupType,
    package,
    service,
    netCharge,
    insured,
    declaredValue,
    type,
  ];

  const { rows } = await client.query(query, vals);
  return rows[0];
}

async function insertTracking(shipment_id, tracking_number, carrier_id) {
  const query = `
    UPDATE exchange.shipments
    SET tracking_number = $1,
        carrier_id = $2
    WHERE id = $3
    RETURNING *;
  `;
  const vals = [tracking_number, carrier_id, shipment_id];
  return await pool.query(query, vals);
}

async function insertPickup(client, orderId, userId, pickup) {
  const query = `
    INSERT INTO exchange.carrier_pickups (
      user_id, 
      order_id,
      carrier,
      pickup_requested_at, 
      pickup_status,
      confirmation_number, 
      location
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const requestedAt = new Date(`${pickup.date}T${pickup.time}Z`).toISOString();
  const vals = [
    userId,
    orderId,
    "FedEx",
    requestedAt,
    "scheduled",
    pickup.confirmationNumber,
    pickup.location,
  ];
  const { rows } = await client.query(query, vals);
  return rows[0];
}

//new stuff
async function getCarrier(carrier_id, client) {
  const query = `
  SELECT name
  FROM exchange.carriers
  WHERE id = $1
  `;

  const values = [carrier_id];
  const result = await client.query(query, values);
  return result.rows[0]?.name ?? "";
}

async function getTrackingEvents(shipment_id, client) {
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
      FROM exchange.shipments s
      LEFT JOIN exchange.shipment_tracking_events e
        ON s.id = e.shipment_id
      WHERE s.id = $1
      GROUP BY s.id
    `;

  const { rows } = await client.query(query, [shipment_id]);
  return rows[0];
}

async function deleteTrackingEvents(shipment_id, client) {
  const query = `
  DELETE FROM exchange.shipment_tracking_events 
  WHERE shipment_id = $1
  `;
  const values = [shipment_id];
  await client.query(query, values);
}

async function insertTrackingEvents(trackingInfo, shipment_id, client) {
  const events = trackingInfo.scanEvents;
  if (!events.length) return;

  const statuses = events.map((e) => e.status);
  const locations = events.map((e) => e.location);
  const times = events.map((e) => e.date);
  const ids = new Array(events.length).fill(shipment_id);

  const query = `
    INSERT INTO exchange.shipment_tracking_events
      (shipment_id, status, location, scan_time)
    SELECT *
      FROM UNNEST(
        $1::uuid[],
        $2::text[],
        $3::text[],
        $4::timestamptz[]
      ) AS t(
        shipment_id,
        status,
        location,
        scan_time
      );
  `;

  await client.query(query, [ids, statuses, locations, times]);
}

async function updateStatus(trackingInfo, shipment_id, client) {
  const query = `
    UPDATE exchange.shipments
    SET shipping_status = $1, estimated_delivery = $2, delivered_at = $3
    WHERE id = $4
  `;

  const values = [
    trackingInfo.latestStatus,
    trackingInfo.estimatedDeliveryTime === "TBD"
      ? null
      : trackingInfo.estimatedDeliveryTime,
    trackingInfo.deliveredAt,
    shipment_id,
  ];

  await client.query(query, values);
}

module.exports = {
  insertShipment,
  insertTracking,
  insertPickup,
  getCarrier,
  getTrackingEvents,
  deleteTrackingEvents,
  insertTrackingEvents,
  updateStatus,
};
