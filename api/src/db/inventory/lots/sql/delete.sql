DELETE FROM inventory.lots WHERE id = $1 RETURNING id
