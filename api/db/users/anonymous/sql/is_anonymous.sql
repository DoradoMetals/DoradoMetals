-- Is this user a visitor better-auth minted, or a real account?
-- The column is NOT NULL DEFAULT false (migration 122), so a row that exists
-- always answers one or the other; zero rows answers nothing and the repo
-- turns that into false.
SELECT "isAnonymous" AS is_anonymous
  FROM auth.users
 WHERE id = $1
