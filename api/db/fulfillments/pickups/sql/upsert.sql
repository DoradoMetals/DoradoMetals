-- Booking a pickup is an UPSERT, not an insert: rescheduling is the common case
-- and a fulfillment may hold only one
-- (fulfillment_pickups_one_per_fulfillment).
INSERT INTO fulfillments.pickups
       (id, fulfillment_id, pickup_address_id, assigned_employee_id, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (fulfillment_id) DO UPDATE SET
  pickup_address_id    = EXCLUDED.pickup_address_id,
  assigned_employee_id = EXCLUDED.assigned_employee_id,
  start_time           = EXCLUDED.start_time,
  end_time             = EXCLUDED.end_time
RETURNING id, fulfillment_id, pickup_address_id, assigned_employee_id,
          start_time, end_time
