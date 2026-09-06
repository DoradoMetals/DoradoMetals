SELECT e.id
  FROM auth.employees e
 WHERE e.user_id = $1
   AND e.enabled
