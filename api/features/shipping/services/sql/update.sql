-- Every caller-supplied field, keyed by id.
--
-- Same parameter order as create, shifted by one because the id moves to the
-- end - and the same order as sql/legacy/update.sql.
UPDATE shipping.services
   SET carrier_id = $1,
       name = $2,
       description = $3,
       code = $4,
       provider_code = $5,
       supports_pickups = $6,
       supports_dropoffs = $7,
       supports_returns = $8,
       supports_insurance = $9,
       is_international = $10,
       is_residential = $11,
       is_active = $12,
       max_weight_lb = $13,
       max_length_in = $14,
       max_width_in = $15,
       max_height_in = $16,
       max_declared_value = $17,
       min_transit_days = $18,
       max_transit_days = $19,
       display_order = $20,
       updated_by = $21,
       updated_at = NOW()
 WHERE id = $22
RETURNING
          id, carrier_id, name, description, code, provider_code,
          supports_pickups  AS supports_pickup,
          supports_dropoffs AS supports_dropoff,
          supports_returns, supports_insurance,
          is_international, is_residential, is_active,
          max_weight_lb     AS max_weight_lbs,
          max_length_in, max_width_in, max_height_in, max_declared_value,
          min_transit_days, max_transit_days, display_order,
          created_by, updated_by, created_at, updated_at
