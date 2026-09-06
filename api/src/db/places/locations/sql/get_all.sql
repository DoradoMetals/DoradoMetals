-- The Office selects: a refiner order's refinery, a pickup's dispatching
-- office, an appointment's branch. Enabled rows only - a location nobody works
-- out of is not a choice.
SELECT id, address_id, image_id, organization_id, name, type, enabled,
       label_company_name, label_phone_number, default_return, carrier_location_code
  FROM places.locations
 WHERE enabled
 ORDER BY type ASC, name ASC
