-- Mirror of sql/update.sql, same parameter order, exchange's column names.
UPDATE exchange.carrier_services
   SET carrier_id = $1,
       name = $2,
       description = $3,
       code = $4,
       provider_code = $5,
       supports_pickup = $6,
       supports_dropoff = $7,
       supports_returns = $8,
       supports_insurance = $9,
       is_international = $10,
       is_residential = $11,
       is_active = $12,
       max_weight_lbs = $13,
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
RETURNING id
