-- The pickup details of several fulfillments at once, for composing a list
-- without a query per row.
SELECT id, fulfillment_id, pickup_address_id, assigned_employee_id,
       start_time, end_time
  FROM fulfillments.pickups
 WHERE fulfillment_id = ANY($1::uuid[])
