-- The same service in the schema still serving as record of truth, whose names
-- for three of these columns are the ones the wire uses.
INSERT INTO exchange.carrier_services
       (id, carrier_id, name, description, code, provider_code,
        supports_pickup, supports_dropoff, supports_returns, supports_insurance,
        is_international, is_residential, is_active,
        max_weight_lbs, max_length_in, max_width_in, max_height_in,
        max_declared_value, min_transit_days, max_transit_days, display_order,
        created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23)
RETURNING id
