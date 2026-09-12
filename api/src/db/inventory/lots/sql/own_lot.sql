-- The two filters that stop inventory counting the same metal twice. A lot on
-- a refiner order IS the refiner's copy of one of ours, and a sale lot is the
-- copy we minted to sell one we hold. Neither is a separate thing in stock.
NOT EXISTS (SELECT 1 FROM refining.lots rl WHERE rl.lot_id = li.id)
AND NOT EXISTS (SELECT 1 FROM inventory.lot_sources s
                 WHERE s.lot_id = li.id AND s.kind = 'sale')
