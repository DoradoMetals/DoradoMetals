-- A new service. The id is supplied by the service layer, not generated here,
-- so both schemas end up with the same primary key.
--
-- The three renamed columns take their NEW names here and their old ones in
-- sql/legacy/create.sql; the parameter ORDER is identical in both, so one
-- values array feeds each.
INSERT INTO shipping.services
       (id, carrier_id, name, description, code, provider_code,
        supports_pickups, supports_dropoffs, supports_returns, supports_insurance,
        is_international, is_residential, is_active,
        max_weight_lb, max_length_in, max_width_in, max_height_in,
        max_declared_value, min_transit_days, max_transit_days, display_order,
        created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23)
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
