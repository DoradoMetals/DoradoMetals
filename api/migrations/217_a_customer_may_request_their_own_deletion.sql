-- The self-serve account screen needs a deletion REQUEST, not a delete: a
-- fact on the row, read back on the profile. Additive; exchange is untouched.

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamp with time zone;
