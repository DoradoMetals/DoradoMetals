SELECT to_jsonb(sp)
       || jsonb_build_object(
            'created_at', to_char(sp.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(sp.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS row
  FROM refiners.spots sp
 WHERE sp.refiner_order_id = $1
 ORDER BY sp.metal_id ASC, sp.id ASC
