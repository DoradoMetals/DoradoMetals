-- The refiner's own weights start as the customer's declaration and are
-- corrected when the assay comes back. `a_lot_goes_to_one_refiner` refuses a
-- lot that already sits on another refiner order, which is the pooling
-- guarantee stated as a constraint rather than a rule in a service.
INSERT INTO refining.lots (refining_order_id, lot_id, unit, pre_melt, post_melt, purity)
SELECT $1, li.id, li.unit, li.pre_melt, li.post_melt, li.purity
  FROM lots.items li
 WHERE li.id = ANY($2::uuid[])
RETURNING id, refining_order_id, lot_id, unit, pre_melt, post_melt, purity, content, premium,
          to_char(settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
