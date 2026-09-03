-- The method a direction spells with this type - how a payout account and a
-- Stripe instrument both resolve to a method_id. (direction, type) is the
-- natural key; 109 reconciled the rows to the vocabulary the stored payouts
-- speak, so there is no rename to bridge any more.
SELECT id, image_id, direction, type, currency, min_amount, max_amount,
       enabled, supports_partial, supports_split, provider, provider_value,
       flat_fee, surcharge_percent, time_delay, label, surcharge_label,
       short_description, long_description, fit_description, fit_header,
       fit_bullets, sort_order, display, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id, details
  FROM payments.methods
 WHERE direction::text = $1::text AND type = $2::text
