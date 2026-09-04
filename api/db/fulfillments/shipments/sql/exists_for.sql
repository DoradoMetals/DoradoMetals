SELECT EXISTS (
         SELECT 1 FROM fulfillments.shipments WHERE fulfillment_id = $1
       ) AS present
