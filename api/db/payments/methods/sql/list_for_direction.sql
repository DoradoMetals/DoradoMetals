-- Every row for one direction, display=false and enabled=false INCLUDED:
-- which rows a surface shows is the CLIENT's branch (the sale WIRE row is
-- disabled but the admin still lists it; APPLE PAY hides from the picker but
-- the Stripe element still maps its type through the row).
SELECT id, image_id, direction, type, currency, min_amount, max_amount,
       enabled, supports_partial, supports_split, provider, provider_value,
       flat_fee, surcharge_percent, time_delay, label, surcharge_label,
       short_description, long_description, fit_description, fit_header,
       fit_bullets, sort_order, display, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id, details
  FROM payments.methods
 WHERE direction::text = $1::text
 ORDER BY direction ASC, sort_order ASC, id ASC
