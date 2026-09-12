SELECT EXISTS (
         SELECT 1
           FROM orders.orders o
           JOIN orders.addresses oa ON oa.order_id = o.id
          WHERE oa.source_address_id = $1
            AND o.user_id = $2
            AND /*__order_state__*/ <> 'Completed'
       ) AS locked
