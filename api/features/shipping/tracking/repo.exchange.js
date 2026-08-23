import query from "#shared/db/query.js";

export async function getEvents(shipment_id, client) {
  const q = `
    SELECT 
      s.*,
      COALESCE(
        json_agg(
          json_build_object(
            'status', e.status,
            'location', e.location,
            'scan_time', e.scan_time
          )
          ORDER BY e.scan_time ASC
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS scan_events
    FROM exchange.shipments s
    LEFT JOIN exchange.tracking_events e
      ON s.id = e.shipment_id
    WHERE s.id = $1
    GROUP BY s.id
  `;

  const { rows } = await query(q, [shipment_id], client);
  return rows[0] ?? null;
}

export async function removeEvents(shipment_id, client) {
  const q = `
    DELETE FROM exchange.tracking_events 
    WHERE shipment_id = $1
  `;
  await query(q, [shipment_id], client);
  return true;
}

export async function insertEvents(trackingInfo, shipment_id, client) {
  const events = trackingInfo?.scanEvents ?? [];
  if (!events.length) return 0;

  const statuses = events.map((e) => e.status ?? null);
  const locations = events.map((e) => e.location ?? null);
  const times = events.map((e) => e.date ?? null);
  const ids = new Array(events.length).fill(shipment_id);

  const q = `
    INSERT INTO exchange.tracking_events
      (shipment_id, status, location, scan_time)
    SELECT *
    FROM UNNEST(
      $1::uuid[],
      $2::text[],
      $3::text[],
      $4::timestamptz[]
    ) AS t(shipment_id, status, location, scan_time)
  `;

  await query(q, [ids, statuses, locations, times], client);
  return events.length;
}
