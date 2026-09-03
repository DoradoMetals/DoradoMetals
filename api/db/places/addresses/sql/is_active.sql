-- Whether an address is in use by an order that has not finished, which is what
-- stops it being edited or deleted underneath one.
--
-- The order no longer carries the address id - orders.addresses does, and it
-- records both the snapshot and the address book row it came from. Matching on
-- source_address_id is what keeps this asking the question exchange asked:
-- compared against the exchange statement for all nine (address, user) pairs
-- dev has an order for, and they agree.
SELECT EXISTS (
         SELECT 1
           FROM orders.orders o
           JOIN orders.addresses oa ON oa.order_id = o.id
          WHERE oa.source_address_id = $1
            AND o.user_id = $2
            AND o.status IS DISTINCT FROM 'Completed'
       ) AS locked
