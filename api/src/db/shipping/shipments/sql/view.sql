SELECT jsonb_build_object(
         'id', s.id,
         'carrier_service_id', s.carrier_service_id,
         'package_id', s.package_id,
         'recipient_address_id', s.recipient_address_id,
         'shipper_address_id', s.shipper_address_id,
         'tracking_number', s.tracking_number,
         'delivered_at', to_char(s.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'shipped_at', to_char(s.shipped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'est_delivery', to_char(s.est_delivery AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'label_type', s.label_type,
         'direction', s.direction::text,
         'insured', s.insured,
         'declared_value', s.declared_value,
         'cost', s.cost,
         'actual_cost', s.actual_cost,
         'shipping_status', s.shipping_status,
         'pickup_type', s.pickup_type,
         'pickup_date', s.pickup_date,
         'pickup_time', s.pickup_time,
         'created_at', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         AS shipment,
       CASE WHEN cs.id IS NULL THEN NULL ELSE
         jsonb_build_object(
           'id', cs.id,
           'carrier_id', cs.carrier_id,
           'name', cs.name,
           'description', cs.description,
           'code', cs.code,
           'provider_code', cs.provider_code,
           'supports_pickup', cs.supports_pickups,
           'supports_dropoff', cs.supports_dropoffs,
           'supports_returns', cs.supports_returns,
           'supports_insurance', cs.supports_insurance,
           'is_international', cs.is_international,
           'is_residential', cs.is_residential,
           'is_active', cs.is_active,
           'max_weight_lbs', cs.max_weight_lb,
           'max_length_in', cs.max_length_in,
           'max_width_in', cs.max_width_in,
           'max_height_in', cs.max_height_in,
           'max_declared_value', cs.max_declared_value,
           'min_transit_days', cs.min_transit_days,
           'max_transit_days', cs.max_transit_days,
           'display_order', cs.display_order,
           'created_by', cs.created_by,
           'updated_by', cs.updated_by,
           'created_at', to_char(cs.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'updated_at', to_char(cs.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS service,
       cs.carrier_id AS carrier_id,
       CASE WHEN pk.id IS NULL THEN NULL ELSE
         jsonb_build_object(
           'id', pk.id,
           'carrier_id', pk.carrier_id,
           'image_id', pk.image_id,
           'length', pk.length,
           'width', pk.width,
           'height', pk.height,
           'label', pk.label,
           'is_carrier_packaging', pk.is_carrier_packaging,
           'min_weight_lb', pk.min_weight_lb,
           'created_at', to_char(pk.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'updated_at', to_char(pk.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS package,
       CASE WHEN cp.id IS NULL THEN NULL ELSE
         to_jsonb(cp)
         || jsonb_build_object(
              'requested_at', to_char(cp.requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       END AS carrier_pickup,
       to_char(cp.requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS handoff_at,
       COALESCE(
         (SELECT jsonb_agg(
                   jsonb_build_object(
                     'id', tr.id,
                     'shipment_id', tr.shipment_id,
                     'status', tr.status,
                     'location', tr.location,
                     'scan_time', to_char(tr.time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   ORDER BY tr.time ASC, tr.id ASC)
            FROM shipping.tracking tr
           WHERE tr.shipment_id = s.id),
         '[]'::jsonb) AS tracking
  FROM shipping.shipments s
  LEFT JOIN shipping.services cs ON cs.id = s.carrier_service_id
  LEFT JOIN shipping.packages pk ON pk.id = s.package_id
  LEFT JOIN LATERAL (
         SELECT * FROM shipping.pickups p
          WHERE p.shipment_id = s.id
          ORDER BY p.requested_at DESC, p.id ASC LIMIT 1
       ) cp ON TRUE
 WHERE ($1::uuid IS NULL OR s.id = $1::uuid)
   AND ($2::uuid IS NULL
        OR s.id IN (SELECT fs.shipment_id
                      FROM fulfillments.shipments fs
                      JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
                     WHERE f.order_id = $2::uuid))
 ORDER BY s.created_at ASC, s.id ASC
