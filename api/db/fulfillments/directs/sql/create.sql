INSERT INTO fulfillments.directs
       (fulfillment_id, location_id, assigned_employee_id, is_appointment,
        start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
          start_time, end_time
