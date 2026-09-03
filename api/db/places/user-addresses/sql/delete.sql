-- Remove one person's link to one address. The address itself survives this -
-- it may be somebody else's too, and an order may have snapshotted it.
DELETE FROM places.user_addresses WHERE address_id = $1 AND user_id = $2
