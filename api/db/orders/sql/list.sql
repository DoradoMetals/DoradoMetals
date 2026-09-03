-- THE ORDER READ (wave 3): orders.orders, VERBATIM, and nothing joined on.
--
-- Every column of the table, named rather than `*`, so a column added to
-- orders.orders is a deliberate addition to the wire rather than one that
-- arrives on the next deploy - validate:wire refuses a field no contract
-- declares, and this is the statement that would hand it one.
--
-- Direction and owner are both OPTIONAL narrowings, passed as null to mean
-- "every one": $1 the direction, $2 the owner. Written as a single statement
-- rather than three so there is one plan and one place the column list lives.
--
-- ORDER BY created_at DESC, id DESC - the id breaks the tie, because
-- created_at is not unique and a read whose ORDER BY is not unique returns
-- physical order.
SELECT id, user_id, direction, status, number, notes, review_created,
       created_by, updated_by, created_at, updated_at,
       created_by_id, updated_by_id, order_sent, tracking_updated, spots_locked
  FROM orders.orders
 WHERE ($1::orders.direction IS NULL OR direction = $1::orders.direction)
   AND ($2::uuid IS NULL OR user_id = $2::uuid)
 ORDER BY created_at DESC, id DESC
