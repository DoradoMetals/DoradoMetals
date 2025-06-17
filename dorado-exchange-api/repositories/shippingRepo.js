async function insertShipment(client, orderId, kind, data, labelBuffer) {
  const table =
    kind === "return"
      ? "exchange.return_shipments"
      : "exchange.inbound_shipments";

  const query = `
    INSERT INTO ${table} (
      order_id,
      tracking_number,
      carrier,
      shipping_status,
      shipping_label,
      label_type,
      pickup_type,
      package,
      service_type,
      net_charge,
      insured,
      declared_value
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `;

  const vals = [
    orderId,
    data.tracking_number,
    data.carrier || "FedEx",
    "Label Created",
    labelBuffer,
    "Generated",
    data.pickup?.name || "Store Dropoff",
    data.package.label || "Small Box",
    data.service.serviceDescription || "Express Saver",
    data.service.netCharge,
    data.insurance.insured,
    data.insurance.declaredValue.amount,
  ];

  const { rows } = await client.query(query, vals);
  return rows[0];
}

async function insertOutboundShipment(
  client,
  order_id,
  carrier,
  service,
  shipping_cost,
  declared_value
) {
  const query = `
    INSERT INTO exchange.outbound_shipments (
      order_id,
      carrier,
      shipping_status,
      label_type,
      pickup_type,
      package,
      service_type,
      net_charge,
      insured,
      declared_value
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const vals = [
    order_id,
    carrier,
    "Label Created",
    "Generated",
    "DropShip",
    "Small Box",
    service,
    shipping_cost,
    true,
    declared_value,
  ];

  const { rows } = await client.query(query, vals);
  return rows[0];
}

async function insertTrackingNumber(tracking_number, id) {
  const query = `
    UPDATE exchange.outbound_shipments
    SET tracking_number = $1
    WHERE id = $2
    RETURNING *;
  `;
  const vals = [tracking_number, id];
  return await client.query(query, vals);
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

module.exports = {
  insertShipment,
  insertOutboundShipment,
  insertTrackingNumber,
  insertPickup,
};
