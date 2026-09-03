-- Remove a checkout session. Its items go with it (ON DELETE CASCADE).
DELETE FROM checkout.checkouts WHERE id = $1
