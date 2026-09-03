-- Whether an unfinished order depends on this address - what stops it being edited or deleted underneath one.
-- Matches on source_address_id (orders.addresses records both the snapshot and the book row it came from).
SELECT EXISTS (
         SELECT 1
           FROM orders.orders o
           JOIN orders.addresses oa ON oa.order_id = o.id
          WHERE oa.source_address_id = $1
            AND o.user_id = $2
            AND o.status IS DISTINCT FROM 'Completed'
       ) AS locked
