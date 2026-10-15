WITH ord AS (
  SELECT o.id
    FROM orders.orders o
   WHERE o.id = $1
),
direct AS (
  SELECT d.start_time,
         l.name AS office,
         a.line_1, a.city, a.state, a.zip,
         COALESCE(l.label_phone_number, a.phone_number) AS phone,
         (SELECT eu.name FROM auth.employees e
             JOIN auth.users eu ON eu.id = e.user_id
            WHERE e.id = d.assigned_employee_id) AS host
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.directs d ON d.fulfillment_id = f.id
    LEFT JOIN places.locations l ON l.id = d.location_id
    LEFT JOIN places.addresses a ON a.id = l.address_id
   ORDER BY d.is_appointment DESC, d.id ASC
   LIMIT 1
),
visit AS (
  SELECT p.start_time AS starts,
         p.end_time AS ends,
         (SELECT eu.name FROM auth.employees e
             JOIN auth.users eu ON eu.id = e.user_id
            WHERE e.id = p.assigned_employee_id) AS driver
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.pickups p ON p.fulfillment_id = f.id
   ORDER BY p.id ASC
   LIMIT 1
),
intent AS (
  SELECT i.status, d.card_brand, d.last_four, m.label
    FROM ord
    JOIN payments.intents i ON i.order_id = ord.id
    LEFT JOIN payments.details d ON d.id = i.details_id
    LEFT JOIN payments.methods m ON m.id = COALESCE(i.method_id, d.method_id)
   ORDER BY (i.status = 'succeeded') DESC, i.created_at DESC, i.id
   LIMIT 1
),
credit AS (
  SELECT m.label
    FROM ord
    JOIN orders.transactions t ON t.order_id = ord.id AND t.used_funds
    JOIN payments.methods m ON m.direction = 'sale' AND m.type = 'CREDIT'
   LIMIT 1
),
office AS (
  SELECT NULLIF(concat_ws(', ', a.line_1, a.line_2, a.city,
                          NULLIF(concat_ws(' ', a.state, a.zip), '')), '') AS address,
         regexp_replace(right(regexp_replace(COALESCE(l.label_phone_number, o.phone), '\D', '', 'g'), 10),
                        '^(\d{3})(\d{3})(\d{4})$', '(\1) \2-\3') AS phone,
         o.email
    FROM places.locations l
    JOIN organizations.organizations o ON o.id = l.organization_id
    LEFT JOIN places.addresses a ON a.id = l.address_id
   WHERE l.type = 'DORADO_OFFICE' AND l.enabled
   ORDER BY l.name, l.id
   LIMIT 1
),
payout AS (
  SELECT m.label, m.time_delay
    FROM ord
    JOIN orders.transactions t ON t.order_id = ord.id
    JOIN payments.details d ON d.id = t.payout_details_id
    JOIN payments.methods m ON m.id = d.method_id
   LIMIT 1
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'office', (
           SELECT jsonb_build_object(
                    'label', 'OFFICE',
                    'who', COALESCE(direct.office, 'Dorado Metals Exchange'),
                    'lines', to_jsonb(array_remove(ARRAY[
                      NULLIF(concat_ws(', ', direct.line_1, direct.city,
                                       NULLIF(concat_ws(' ', direct.state, direct.zip), '')), ''),
                      regexp_replace(right(regexp_replace(direct.phone, '\D', '', 'g'), 10),
                                     '^(\d{3})(\d{3})(\d{4})$', '(\1) \2-\3')
                    ], NULL)))
             FROM direct),
         'appointment', (
           SELECT jsonb_build_object(
                    'label', 'APPOINTMENT',
                    'who', 'To be confirmed',
                    'at', direct.start_time,
                    'shape', 'datetime',
                    'lines', to_jsonb(array_remove(ARRAY['With ' || direct.host], NULL)))
             FROM direct),
         'pickup', (
           SELECT jsonb_build_object(
                    'label', 'PICKUP',
                    'who', 'To be confirmed',
                    'at', visit.starts,
                    'until', visit.ends,
                    'shape', 'window',
                    'lines', to_jsonb(array_remove(ARRAY['Driver · ' || visit.driver], NULL)))
             FROM visit),
         'card', (
           SELECT jsonb_build_object(
                    'label', 'ACCOUNT',
                    'who', concat_ws(' ', initcap(intent.card_brand), '••••' || intent.last_four),
                    'lines', '[]'::jsonb)
             FROM intent
            WHERE intent.last_four IS NOT NULL),
         'payment', COALESCE(
           (SELECT jsonb_build_object(
                     'label', 'METHOD',
                     'who', COALESCE(intent.label, '-'),
                     'lines', CASE WHEN intent.status = 'succeeded'
                                   THEN jsonb_build_array('Paid in full')
                                   ELSE '[]'::jsonb END)
              FROM intent),
           (SELECT jsonb_build_object('label', 'METHOD', 'who', credit.label, 'lines', '[]'::jsonb)
              FROM credit)),
         'payout', (
           SELECT jsonb_build_object(
                    'label', 'METHOD',
                    'who', payout.label,
                    'lines', to_jsonb(array_remove(ARRAY[payout.time_delay], NULL)))
             FROM payout),
         'contact', (
           SELECT jsonb_build_object('address', office.address, 'phone', office.phone,
                                     'email', office.email)
             FROM office)
       ) AS content
  FROM ord
