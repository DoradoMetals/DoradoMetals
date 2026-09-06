-- RULING 89. The one location a label is held at for collection, with the
-- fields a carrier needs. `carrier_location_code IS NOT NULL` is part of the
-- question: a row marked as the default that the carrier does not know by a
-- code cannot be sent on a label, and answering nothing is what makes that
-- visible instead of shipping a payload with a null id.
SELECT l.carrier_location_code AS code,
       l.type,
       l.label_company_name AS company_name,
       l.label_phone_number AS phone_number,
       json_build_object(
         'line_1', a.line_1,
         'line_2', a.line_2,
         'city', a.city,
         'state', a.state,
         'zip', a.zip,
         'country_code', a.country_code,
         'is_residential', a.is_residential
       ) AS address
  FROM places.locations l
  JOIN places.addresses a ON a.id = l.address_id
 WHERE l.default_return
   AND l.carrier_location_code IS NOT NULL
