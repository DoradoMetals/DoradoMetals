-- The pickup detail of one fulfillment, if it has one.
SELECT id, fulfillment_id, pickup_address_id, assigned_employee_id,
       start_time, end_time
  FROM fulfillments.pickups
 WHERE fulfillment_id = $1
