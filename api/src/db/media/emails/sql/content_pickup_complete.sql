-- Pickup complete (Figma 211:704). What the driver left with, and when.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
booking AS (
  SELECT p.start_time, p.end_time, f.updated_at
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.pickups p ON p.fulfillment_id = f.id
   ORDER BY p.id ASC
   LIMIT 1
),
lots AS (
  SELECT COUNT(*) AS n FROM orders.items i JOIN ord ON ord.id = i.order_id
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
                     'label', 'Collected',
                     'value', COALESCE(
                       to_char(COALESCE(booking.end_time, booking.start_time, booking.updated_at)
                                 AT TIME ZONE 'America/Chicago', 'FMMon ')
                         || to_char(COALESCE(booking.end_time, booking.start_time, booking.updated_at)
                                      AT TIME ZONE 'America/Chicago', 'FMDD') || ', '
                         || to_char(COALESCE(booking.end_time, booking.start_time, booking.updated_at)
                                      AT TIME ZONE 'America/Chicago', 'FMHH12') || ':'
                         || to_char(COALESCE(booking.end_time, booking.start_time, booking.updated_at)
                                      AT TIME ZONE 'America/Chicago', 'MI') || ' '
                         || to_char(COALESCE(booking.end_time, booking.start_time, booking.updated_at)
                                      AT TIME ZONE 'America/Chicago', 'AM') || ' CT',
                       '-')),
                   jsonb_build_object('label', 'Items',
                                      'value', lots.n::text || ' of ' || lots.n::text),
                   jsonb_build_object('label', 'Next step', 'value', 'Weighing and testing'))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  JOIN booking ON TRUE
  CROSS JOIN lots
