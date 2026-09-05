SELECT c.id,
       c.logo,
       to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       jsonb_build_object(
         'id', o.id,
         'name', o.name,
         'email', o.email,
         'phone', o.phone,
         'enabled', o.enabled) AS organization
  FROM shipping.carriers c
  JOIN organizations.organizations o ON o.id = c.organization_id
 WHERE ($1::uuid IS NULL OR c.id = $1::uuid)
 ORDER BY o.name ASC, c.id ASC
