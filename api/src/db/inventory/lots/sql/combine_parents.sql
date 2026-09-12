-- One `combine` edge per parent, pointing at the newly minted result.
-- Content is conserved by combine.sql; this statement only records where
-- each parent went.
INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
SELECT $1::uuid, p, 'combine' FROM unnest($2::uuid[]) AS p
RETURNING id
