-- Remove a payout account.
DELETE FROM payments.details WHERE id = $1
