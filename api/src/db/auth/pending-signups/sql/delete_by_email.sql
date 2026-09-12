DELETE FROM auth.pending_signups WHERE email = $1 AND phone_number IS NULL
