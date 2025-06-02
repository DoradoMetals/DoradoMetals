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
    data.service.serviceType || "FEDEX_EXPRESS_SAVER",
    data.service.netCharge,
    data.insurance.insured,
    data.insurance.declaredValue.amount,
  ];

  const { rows } = await client.query(query, vals);
  return rows[0];
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

module.exports = { insertShipment, insertPickup };
