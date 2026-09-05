INSERT INTO places.user_addresses
       (address_id, user_id, recipient_name, label, default_shipping, default_billing)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, address_id) DO UPDATE SET
  recipient_name = EXCLUDED.recipient_name,
  label = EXCLUDED.label,
  default_shipping = EXCLUDED.default_shipping,
  default_billing = EXCLUDED.default_billing
RETURNING id, address_id, user_id, recipient_name, label, default_shipping, default_billing
