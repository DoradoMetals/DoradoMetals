INSERT INTO fulfillments.pickups
       (fulfillment_id, pickup_address_id, assigned_employee_id, start_time, end_time)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, fulfillment_id, pickup_address_id, assigned_employee_id,
          start_time, end_time
