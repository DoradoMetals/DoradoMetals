SELECT count(*)::int AS n
  FROM payments.intents
 WHERE session_id = $1
   AND user_id IS NOT DISTINCT FROM $2
   AND type = $3
