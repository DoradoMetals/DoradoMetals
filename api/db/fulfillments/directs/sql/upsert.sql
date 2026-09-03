-- Booking an appointment is an upsert for the same reason a pickup is.
INSERT INTO fulfillments.directs
       (id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
        start_time, end_time)
VALUES ($1, $2, $3, $4, COALESCE($5, true), $6, $7)
ON CONFLICT (fulfillment_id) DO UPDATE SET
  location_id          = EXCLUDED.location_id,
  assigned_employee_id = EXCLUDED.assigned_employee_id,
  is_appointment       = EXCLUDED.is_appointment,
  start_time           = EXCLUDED.start_time,
  end_time             = EXCLUDED.end_time
RETURNING id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
          start_time, end_time
