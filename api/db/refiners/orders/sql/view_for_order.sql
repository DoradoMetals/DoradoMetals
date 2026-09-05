SELECT to_jsonb(ro)
       || jsonb_build_object(
            'created_at', to_char(ro.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(ro.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'refiner',
            (SELECT jsonb_build_object(
                      'id', r.id,
                      'logo', r.logo,
                      'created_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'updated_at', to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'organization', jsonb_build_object(
                        'id', o.id,
                        'name', o.name,
                        'email', o.email,
                        'phone', o.phone,
                        'enabled', o.enabled))
               FROM refiners.refiners r
               JOIN organizations.organizations o ON o.id = r.organization_id
              WHERE r.id = ro.refiner_id),
            'items',
            COALESCE(
              (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.order_item_id ASC, ri.id ASC)
                 FROM refiners.items ri
                WHERE ri.refiner_order_id = ro.id),
              '[]'::jsonb),
            'spots',
            COALESCE(
              (SELECT jsonb_agg(
                        to_jsonb(sp)
                        || jsonb_build_object(
                             'created_at', to_char(sp.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                             'updated_at', to_char(sp.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                        ORDER BY sp.metal_id ASC, sp.id ASC)
                 FROM refiners.spots sp
                WHERE sp.refiner_order_id = ro.id),
              '[]'::jsonb)) AS view
  FROM refiners.orders ro
 WHERE ro.order_id = $1
