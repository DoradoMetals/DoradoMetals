-- The refiner's rows for one CUSTOMER ORDER, verbatim.
--
-- refiners.items keys on the customer LINE (order_item_id), and the line
-- keys on the order - so "the refiner rows of this order" is that walk, done
-- in the WHERE clause (ruling 12) rather than by nesting the refiner values
-- onto the items read. The two reads stay separate on purpose: what the
-- customer was quoted and what the refinery reported are different facts,
-- and the composed wire smeared the second onto the first as
-- scrap.purity_actual / scrap.post_melt_actual / scrap.content_actual.
SELECT ri.id, ri.order_item_id, ri.refiner_id, ri.bullion_id, ri.metal_id,
       ri.pre_melt, ri.post_melt, ri.purity, ri.content, ri.premium,
       ri.quantity, ri.unit, ri.refiner_order_id
  FROM refiners.items ri
  JOIN orders.items oi ON oi.id = ri.order_item_id
 WHERE oi.order_id = $1
 ORDER BY ri.order_item_id ASC
