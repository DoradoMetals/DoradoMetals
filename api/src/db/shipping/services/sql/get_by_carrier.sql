SELECT
       id, carrier_id, name, description, code, provider_code,
       supports_pickups  AS supports_pickup,
       supports_dropoffs AS supports_dropoff,
       supports_returns, supports_insurance,
       is_international, is_residential, is_active,
       max_weight_lb     AS max_weight_lbs,
       max_length_in, max_width_in, max_height_in, max_declared_value,
       min_transit_days, max_transit_days, display_order,
       created_by, updated_by, created_at, updated_at
  FROM shipping.services
 WHERE carrier_id = $1
 ORDER BY name ASC, id ASC
