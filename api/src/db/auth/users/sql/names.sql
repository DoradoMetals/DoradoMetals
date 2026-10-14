-- The names behind a batch of user ids, for a screen that shows who did what.
-- An id with no user is left out, not returned as a null row.
SELECT u.id, u.name
  FROM auth.users u
 WHERE u.id = ANY($1::uuid[])
 ORDER BY u.id
