-- Pickup booked (Figma 211:659). The window, where the driver is coming to, and
-- who is coming. $1 is the ORDER, because that is the key every trigger holds
-- and it is what the paper-trail row links to.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
booking AS (
  SELECT p.start_time, p.end_time,
         a.line_1, a.city, a.state,
         (SELECT eu.name FROM auth.employees e
             JOIN auth.users eu ON eu.id = e.user_id
            WHERE e.id = p.assigned_employee_id) AS driver
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.pickups p ON p.fulfillment_id = f.id
    LEFT JOIN places.addresses a ON a.id = p.pickup_address_id
   ORDER BY p.id ASC
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
         'venue', NULL,
         'rows', jsonb_build_array(
                   jsonb_build_object(
                     'label', 'Window',
                     'value', COALESCE(
                       to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMDy, FMMon ')
                         || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMDD')
                         || ' - '
                         || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'FMHH12')
                         || ':' || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'MI')
                         || ' ' || to_char(booking.start_time AT TIME ZONE 'America/Chicago', 'AM')
                         || COALESCE(
                              ' to '
                                || to_char(booking.end_time AT TIME ZONE 'America/Chicago', 'FMHH12')
                                || ':' || to_char(booking.end_time AT TIME ZONE 'America/Chicago', 'MI')
                                || ' ' || to_char(booking.end_time AT TIME ZONE 'America/Chicago', 'AM'),
                              ''),
                       'To be confirmed')),
                   jsonb_build_object(
                     'label', 'Address',
                     'value', COALESCE(booking.line_1 || ', ' || booking.city || ', ' || booking.state,
                                       booking.line_1, '-')),
                   jsonb_build_object('label', 'Driver',
                                      'value', COALESCE(booking.driver, 'A Dorado driver')))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  JOIN booking ON TRUE
