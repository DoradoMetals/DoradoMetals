-- Appointment booked (Figma 211:747). When, which office, and who the customer
-- is seeing. A DIRECT that is not an appointment is a walk-in and gets no
-- mailer, so the read requires is_appointment.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
booking AS (
  SELECT d.start_time,
         l.name AS office,
         a.line_1,
         (SELECT eu.name FROM auth.employees e
             JOIN auth.users eu ON eu.id = e.user_id
            WHERE e.id = d.assigned_employee_id) AS host
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.directs d ON d.fulfillment_id = f.id
    LEFT JOIN places.locations l ON l.id = d.location_id
    LEFT JOIN places.addresses a ON a.id = l.address_id
   WHERE d.is_appointment
   ORDER BY d.id ASC
   LIMIT 1
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', ord.number,
         'direction', ord.direction::text,
         'starts_at', to_char(booking.start_time AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'venue', COALESCE(booking.office || ', ' || booking.line_1, booking.line_1, booking.office),
         'rows', jsonb_build_array(
                   jsonb_build_object(
                     'label', 'When',
                     'value', COALESCE(
                       to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMDy, FMMon ')
                         || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMDD')
                         || ' - '
                         || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMHH12')
                         || ':' || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'MI')
                         || ' ' || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'AM'),
                       'To be confirmed')),
                   jsonb_build_object(
                     'label', 'Office',
                     'value', COALESCE(booking.office || ' - ' || booking.line_1,
                                       booking.office, booking.line_1, 'Dorado Metals Exchange')),
                   jsonb_build_object('label', 'With',
                                      'value', COALESCE(booking.host, 'Our front desk')))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  JOIN booking ON TRUE
