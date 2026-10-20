-- A lead as a mail addressee: no order and no user, its email and name.
SELECT jsonb_build_object(
         'order_id', NULL,
         'user_id', NULL,
         'email', l.email,
         'name', l.name
       ) AS content
  FROM leads.leads l
 WHERE l.id = $1
   AND l.email IS NOT NULL
