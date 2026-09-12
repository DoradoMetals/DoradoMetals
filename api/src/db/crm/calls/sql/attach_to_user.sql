-- A lead's calls carry no user_id until the lead converts. Matched on the
-- last 10 digits so a bare 10-digit lead phone still finds the E.164 numbers
-- Twilio writes (the same normalisation the inbox list uses).
UPDATE crm.calls
   SET user_id = $2
 WHERE user_id IS NULL
   AND (
     right(regexp_replace(from_number, '\D', '', 'g'), 10) = right(regexp_replace($1, '\D', '', 'g'), 10)
     OR right(regexp_replace(to_number, '\D', '', 'g'), 10) = right(regexp_replace($1, '\D', '', 'g'), 10)
   )
