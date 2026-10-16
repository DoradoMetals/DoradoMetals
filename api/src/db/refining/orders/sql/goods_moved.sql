-- Whether a refiner order's metal has moved (ruling 145): its parcel was
-- delivered, or its fulfillment was dropped off, picked up or completed. A
-- cancel after that returns the lots; a cancel before it needs no return.
SELECT EXISTS (
         SELECT 1
           FROM fulfillments.fulfillments f
           LEFT JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
           LEFT JOIN shipping.shipments sh ON sh.id = fs.shipment_id
                                          AND sh.direction <> 'Return'
          WHERE f.refining_order_id = $1
            AND (f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')
                 OR sh.delivered_at IS NOT NULL
                 OR sh.shipping_status = 'Delivered')
       ) AS moved
