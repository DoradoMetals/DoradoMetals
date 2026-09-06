-- Document sent (Figma 214:904). One mailer for every document an admin sends
-- from an order. $1 is the order, $2 the document's name and $3 its size in
-- bytes: the document itself travels as an attachment, so the read describes it
-- rather than pointing at a media.pdfs row that a test run never writes.
SELECT jsonb_build_object(
         'order_id', o.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', o.number,
         'direction', o.direction::text,
         'document_label', $2::text,
         'rows', jsonb_build_array(
                   jsonb_build_object('label', 'Document', 'value', $2::text),
                   jsonb_build_object(
                     'label', 'Format',
                     'value', 'PDF'
                       || COALESCE(' - ' || to_char(ceil($3::bigint / 1024.0),
                                                    'FM999,999,990') || ' KB', '')),
                   jsonb_build_object(
                     'label', 'Sent',
                     'value', to_char(now() AT TIME ZONE 'America/Chicago', 'FMMon ')
                                || to_char(now() AT TIME ZONE 'America/Chicago', 'FMDD')
                                || ', '
                                || to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY')
                                || ' - '
                                || to_char(now() AT TIME ZONE 'America/Chicago', 'FMHH12')
                                || ':'
                                || to_char(now() AT TIME ZONE 'America/Chicago', 'MI')
                                || ' '
                                || to_char(now() AT TIME ZONE 'America/Chicago', 'AM')
                                || ' CT'))
       ) AS content
  FROM orders.orders o
  JOIN auth.users u ON u.id = o.user_id
 WHERE o.id = $1
