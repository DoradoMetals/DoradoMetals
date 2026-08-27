-- Pickups falling in a window, optionally for one employee.
--
-- A NULL bound means "unbounded" rather than "matches nothing", which is what
-- the `$1::timestamptz IS NULL OR` shape buys.
--
-- Rows with no start_time ARE returned. An unscheduled pickup is work to be
-- booked, and the caller sorts it last - see compose.ts. Filtering it out here
-- would hide the work rather than order it.
SELECT id, fulfillment_id, pickup_address_id, assigned_employee_id,
       start_time, end_time
  FROM fulfillments.pickups
 WHERE ($1::timestamptz IS NULL OR start_time >= $1)
   AND ($2::timestamptz IS NULL OR start_time <  $2)
   AND ($3::uuid IS NULL OR assigned_employee_id = $3)
