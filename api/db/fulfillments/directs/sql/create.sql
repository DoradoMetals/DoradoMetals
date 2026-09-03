-- One row per fulfillment - the service reads first, so this is a genuine insert, never a conflict.
INSERT INTO fulfillments.directs
       (id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
        start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
          start_time, end_time
