SELECT to_jsonb(f)
       || jsonb_build_object(
            'created_at', to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         AS fulfillment,
       jsonb_build_object(
         'id', m.id,
         'type', m.type,
         'label', m.label,
         'admin_label', m.admin_label,
         'category', m.category,
         'direction', m.direction,
         'enabled', m.enabled,
         'hidden', m.hidden,
         'is_default', m.is_default,
         'created_at', to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'updated_at', to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         AS method,
       CASE WHEN fp.id IS NULL THEN NULL ELSE
         to_jsonb(fp)
         || jsonb_build_object(
              'start_time', to_char(fp.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'end_time', to_char(fp.end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS pickup,
       CASE WHEN fd.id IS NULL THEN NULL ELSE
         to_jsonb(fd)
         || jsonb_build_object(
              'start_time', to_char(fd.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'end_time', to_char(fd.end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS direct,
       CASE WHEN fo.id IS NULL THEN NULL ELSE
         to_jsonb(fo)
         || jsonb_build_object(
              'start_time', to_char(fo.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'end_time', to_char(fo.end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'departed_at', to_char(fo.departed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'dropped_off_at', to_char(fo.dropped_off_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'created_at', to_char(fo.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'updated_at', to_char(fo.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS dropoff,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(fs) ORDER BY fs.id ASC)
            FROM fulfillments.shipments fs
           WHERE fs.fulfillment_id = f.id),
         '[]'::jsonb) AS shipments,
       -- THE PARCEL IS THE HANDOVER LEG, never a return. A cancel and a supplier
       -- send both link a second shipment to the same fulfillment, and
       -- `ORDER BY fs.id` is an ordering over random uuids - so which leg the
       -- customer was shown was a coin flip per order (LD F3). A return leg is
       -- its own kind of link; the handover is the earliest non-Return one.
       (SELECT jsonb_build_object(
                 'id', s.id,
                 'direction', s.direction::text,
                 'shipper_address_id', s.shipper_address_id,
                 'recipient_address_id', s.recipient_address_id,
                 'package_id', s.package_id,
                 'carrier_service_id', s.carrier_service_id,
                 'pickup_date', s.pickup_date,
                 'pickup_time', s.pickup_time,
                 'tracking_number', s.tracking_number)
          FROM fulfillments.shipments fs
          JOIN shipping.shipments s ON s.id = fs.shipment_id
         WHERE fs.fulfillment_id = f.id
           AND s.direction <> 'Return'
         ORDER BY s.created_at ASC NULLS FIRST, s.id ASC
         LIMIT 1) AS parcel,
       to_char(COALESCE(fp.start_time, fd.start_time, fo.start_time) AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS scheduled_at,
       -- THE DROP SHIP LINK. A refiner BUY order's parcel is posted straight
       -- to the customer whose sales order it fills. No foreign key joins the
       -- two orders (ruling 42); the lot does, in one hop. A SELL order's lot
       -- joins the same way to the PURCHASE order that fed it, but that is the
       -- source, not a drop ship, so it is deliberately excluded here.
       (SELECT jsonb_build_object(
                 'id', od.id, 'number', od.number, 'direction', od.direction,
                 'reference', (CASE WHEN od.direction = 'sale' THEN 'SO-'
                                    ELSE 'PO-' END) || od.number)
          FROM refining.lots rl
          JOIN refining.orders ro ON ro.id = rl.refining_order_id
          JOIN orders.lots ol ON ol.lot_id = rl.lot_id
          JOIN orders.orders od ON od.id = ol.order_id
         WHERE rl.refining_order_id = f.refining_order_id
           AND ro.direction = 'buy'
         ORDER BY od.number ASC
         LIMIT 1) AS linked_order
  FROM fulfillments.fulfillments f
  JOIN fulfillments.methods m ON m.id = f.method_id
  LEFT JOIN LATERAL (
         SELECT * FROM fulfillments.pickups p
          WHERE p.fulfillment_id = f.id ORDER BY p.id ASC LIMIT 1
       ) fp ON TRUE
  LEFT JOIN LATERAL (
         SELECT * FROM fulfillments.directs d
          WHERE d.fulfillment_id = f.id ORDER BY d.id ASC LIMIT 1
       ) fd ON TRUE
  LEFT JOIN LATERAL (
         SELECT * FROM fulfillments.dropoffs o
          WHERE o.fulfillment_id = f.id ORDER BY o.id ASC LIMIT 1
       ) fo ON TRUE
 WHERE ($1::uuid[] IS NULL OR f.id = ANY($1::uuid[]))
   AND ($2::uuid IS NULL OR f.order_id = $2::uuid)
   AND ($3::boolean IS NOT TRUE
        OR fp.id IS NOT NULL OR fd.id IS NOT NULL OR fo.id IS NOT NULL)
   AND ($4::timestamptz IS NULL
        OR COALESCE(fp.start_time, fd.start_time, fo.start_time) >= $4::timestamptz)
   AND ($5::timestamptz IS NULL
        OR COALESCE(fp.start_time, fd.start_time, fo.start_time) < $5::timestamptz)
   AND ($6::uuid IS NULL
        OR COALESCE(fp.assigned_employee_id, fd.assigned_employee_id,
                    fo.driver_employee_id) = $6::uuid)
 ORDER BY COALESCE(fp.start_time, fd.start_time, fo.start_time) ASC NULLS LAST, f.id ASC
