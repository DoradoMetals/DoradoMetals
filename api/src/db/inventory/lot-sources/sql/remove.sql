DELETE FROM inventory.lot_sources WHERE id = $1 RETURNING id
