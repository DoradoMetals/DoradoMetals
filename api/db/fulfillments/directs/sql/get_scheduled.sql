-- Directs falling in a window, optionally for one employee. Same shape as the
-- pickups query - see its header for why a NULL bound is unbounded and why
-- unscheduled rows are kept.
SELECT id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
       start_time, end_time
  FROM fulfillments.directs
 WHERE ($1::timestamptz IS NULL OR start_time >= $1)
   AND ($2::timestamptz IS NULL OR start_time <  $2)
   AND ($3::uuid IS NULL OR assigned_employee_id = $3)
