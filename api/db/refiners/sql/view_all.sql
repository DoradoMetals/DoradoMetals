SELECT jsonb_build_object(
         'id', r.id,
         'logo', r.logo,
         'created_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'updated_at', to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'organization', jsonb_build_object(
           'id', o.id,
           'name', o.name,
           'email', o.email,
           'phone', o.phone,
           'enabled', o.enabled)) AS view
  FROM refiners.refiners r
  JOIN organizations.organizations o ON o.id = r.organization_id
 ORDER BY o.name ASC, r.id ASC
