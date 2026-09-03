-- A person's link to an address: what they call it, and whether it is their default.
-- Conflict is on (user_id, address_id), not address_id - the pair is deliberate, since two people can share an address.
INSERT INTO places.user_addresses
       (id, address_id, user_id, label, default_shipping, default_billing)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, address_id) DO UPDATE SET
  label = EXCLUDED.label,
  default_shipping = EXCLUDED.default_shipping,
  default_billing = EXCLUDED.default_billing
RETURNING id, address_id, user_id, label, default_shipping, default_billing
