SELECT id, fulfillment_id, pickup_address_id, assigned_employee_id,
       start_time, end_time
  FROM fulfillments.pickups
 WHERE ($1::timestamptz IS NULL OR start_time >= $1)
   AND ($2::timestamptz IS NULL OR start_time <  $2)
   AND ($3::uuid IS NULL OR assigned_employee_id = $3)
