SELECT id, name, max_insured_value
  FROM shipping.services
 WHERE carrier_id = $1
   AND is_active = true
