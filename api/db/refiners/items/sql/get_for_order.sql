-- The refiner's rows for one CUSTOMER ORDER, verbatim — refiners.items keys on the line, the line keys on the order, so this walks the join in the WHERE clause rather than nesting refiner values onto the items read.
-- The two reads stay separate on purpose: what the customer was quoted and what the refinery reported are different facts.
SELECT ri.id, ri.order_item_id, ri.refiner_id, ri.bullion_id, ri.metal_id,
       ri.pre_melt, ri.post_melt, ri.purity, ri.content, ri.premium,
       ri.quantity, ri.unit, ri.refiner_order_id
  FROM refiners.items ri
  JOIN orders.items oi ON oi.id = ri.order_item_id
 WHERE oi.order_id = $1
 ORDER BY ri.order_item_id ASC
