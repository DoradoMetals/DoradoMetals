import query from "#shared/db/query.js";

export async function getAll(client) {
  const q = `
  SELECT * FROM exchange.shipments
  `;
  const { rows } = await query(q, [], client);
  return rows ?? null;
}

export async function getById(id, client) {
  const q = `
  SELECT * FROM exchange.shipments
  WHERE id = $1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0] ?? null;
}

export async function getByOrder(id, client) {
  const q = `
  SELECT * FROM exchange.shipments
  WHERE purchase_order_id = $1
  OR sales_order_id = $1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0] ?? null;
}

export async function create(shipment, client) {
  const q = `
    INSERT INTO exchange.shipments (
      purchase_order_id,
      sales_order_id,
      carrier_id,
      type
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const vals = [
    shipment.purchase_order_id ?? null,
    shipment.sales_order_id ?? null,
    shipment.carrier_id ?? null,
    shipment.type ?? null,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function update(shipment, client) {
  const q = `
    UPDATE exchange.shipments
    SET
      tracking_number = $1,
      shipping_status = $2,
      carrier_id = $3,
      estimated_delivery = $4,
      shipped_at = $5,
      delivered_at = $6,
      shipping_label = $7,
      label_type = $8,
      pickup_type = $9,
      package = $10,
      service_type = $11,
      net_charge = $12,
      insured = $13,
      declared_value = $14,
      type = $15
    WHERE id = $16
    RETURNING *;
  `;

  const vals = [
    shipment.tracking_number,
    shipment.shipping_status,
    shipment.carrier_id,
    shipment.estimated_delivery,
    shipment.shipped_at,
    shipment.delivered_at,
    shipment.shipping_label,
    shipment.label_type,
    shipment.pickup_type,
    shipment.package,
    shipment.service_type,
    shipment.net_charge,
    shipment.insured,
    shipment.declared_value,
    shipment.type,
    shipment.id,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function remove(id, client) {
  const q = `
    DELETE FROM exchange.shipments WHERE id = $1
  `;
  return await query(q, [id], client);
}

