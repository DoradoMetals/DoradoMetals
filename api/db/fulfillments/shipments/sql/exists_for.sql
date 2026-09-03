-- Whether a fulfillment already has a parcel.
-- Asked before moving an order off SHIPMENT - a linked parcel has a paid-for label and doesn't stop existing because a dropdown changed.
SELECT EXISTS (
         SELECT 1 FROM fulfillments.shipments WHERE fulfillment_id = $1
       ) AS present
