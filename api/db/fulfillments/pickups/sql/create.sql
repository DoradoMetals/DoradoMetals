-- One row per fulfillment (fulfillment_pickups_one_per_fulfillment) - the service reads first, so this is a genuine insert, never a conflict.
INSERT INTO fulfillments.pickups
       (id, fulfillment_id, pickup_address_id, assigned_employee_id, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, fulfillment_id, pickup_address_id, assigned_employee_id,
          start_time, end_time
