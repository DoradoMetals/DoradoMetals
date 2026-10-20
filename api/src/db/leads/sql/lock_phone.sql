-- Serialises creates for one phone number inside the create transaction: the
-- lock is released at commit or rollback. Exact text, as by_phone matches it.
SELECT pg_advisory_xact_lock(hashtext($1))
