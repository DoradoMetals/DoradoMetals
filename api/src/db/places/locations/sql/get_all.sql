-- The Office selects: a refiner order's refinery, a pickup's dispatching
-- office, an appointment's branch. Enabled rows only - a location nobody works
-- out of is not a choice. $1 narrows to one organization (a refiner's own
-- sites) when named. The address text rides along so a select can print
-- `Name · line 1, City, ST` without a second read.
SELECT l.id, l.address_id, l.image_id, l.organization_id, l.name, l.type, l.enabled,
       l.label_company_name, l.label_phone_number, l.default_return, l.carrier_location_code,
       a.line_1, a.city, a.state
  FROM places.locations l
  LEFT JOIN places.addresses a ON a.id = l.address_id
 WHERE l.enabled
   AND ($1::uuid IS NULL OR l.organization_id = $1::uuid)
 ORDER BY l.type ASC, l.name ASC
