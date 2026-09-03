-- The direct detail of one fulfillment, if it has one - the customer coming to a location.
SELECT id, fulfillment_id, location_id, assigned_employee_id, is_appointment,
       start_time, end_time
  FROM fulfillments.directs
 WHERE fulfillment_id = $1
