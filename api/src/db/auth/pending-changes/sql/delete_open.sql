DELETE FROM auth.pending_changes WHERE user_id = $1 AND confirmed_at IS NULL
