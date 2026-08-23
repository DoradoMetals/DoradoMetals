// Tracking read from the shipping schema.
//
// getEvents returns the whole shipment with its scan events attached, so it
// needs the same reconstruction the shipments read does - the order link put
// back from fulfillments, the service and package resolved to names. The
// projection is imported rather than repeated, so the two cannot drift.
//
// The events themselves are a straight rename: exchange.tracking_events.scan_time
// is shipping.tracking.time. The key inside each JSON object keeps the old name,
// because that is what the response has always carried.
import query from "#shared/db/query.js";
import {
  SHIPMENT_COLUMNS,
  SHIPMENT_FROM,
} from "#features/shipping/shipments/repo.next.js";

export async function getEvents(shipment_id, client) {
  const q = `
    SELECT
      ${SHIPMENT_COLUMNS},
      COALESCE(
        json_agg(
          json_build_object(
            'status', e.status,
            'location', e.location,
            'scan_time', e.time
          )
          ORDER BY e.time ASC
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS scan_events
    ${SHIPMENT_FROM}
    LEFT JOIN shipping.tracking e ON e.shipment_id = s.id
    WHERE s.id = $1
    GROUP BY s.id, o.id, o.direction, sv.name, sv.carrier_id, pk.label
  `;
  const { rows } = await query(q, [shipment_id], client);
  return rows[0] ?? null;
}

export async function removeEvents(shipment_id, client) {
  await query(`DELETE FROM shipping.tracking WHERE shipment_id = $1`, [shipment_id], client);
  return true;
}

export async function insertEvents(trackingInfo, shipment_id, client) {
  const events = trackingInfo?.scanEvents ?? [];
  if (!events.length) return 0;

  await query(
    `INSERT INTO shipping.tracking (shipment_id, status, location, time)
     SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])
       AS t(shipment_id, status, location, time)`,
    [
      new Array(events.length).fill(shipment_id),
      events.map((e) => e.status ?? null),
      events.map((e) => e.location ?? null),
      events.map((e) => e.date ?? null),
    ],
    client
  );
  return events.length;
}
