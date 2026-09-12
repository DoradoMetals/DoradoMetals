-- The basket's lines become lots too, keeping their ids, so a lot minted in a
-- cart is the same row the order and then the refiner see. Same rules as 161.
--
-- checkout.* is device sync rather than a ledger, so losing a basket line is
-- not a data loss - but the ids are the whole point of the model, and the
-- cheapest way to prove they survive placement is to carry the ones that exist.

INSERT INTO inventory.lots
       (id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
        content_snapshot, created_at, updated_at)
SELECT ci.id,
       ci.bullion_id,
       COALESCE(ci.metal_id, b.metal_id),
       COALESCE(ci.unit, 't oz'),
       COALESCE(ci.quantity, 1),
       ci.pre_melt,
       CASE WHEN ci.bullion_id IS NULL THEN ci.post_melt END,
       ci.purity,
       CASE WHEN ci.bullion_id IS NOT NULL THEN ci.content END,
       ci.created_at,
       ci.updated_at
  FROM checkout.items ci
  LEFT JOIN products.bullion b ON b.id = ci.bullion_id
 WHERE COALESCE(ci.metal_id, b.metal_id) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM inventory.lots li WHERE li.id = ci.id);

INSERT INTO checkout.lots (checkout_id, lot_id, created_at, updated_at)
SELECT ci.checkout_id, ci.id, ci.created_at, ci.updated_at
  FROM checkout.items ci
  JOIN inventory.lots li ON li.id = ci.id
 WHERE NOT EXISTS (SELECT 1 FROM checkout.lots cl WHERE cl.lot_id = ci.id);
