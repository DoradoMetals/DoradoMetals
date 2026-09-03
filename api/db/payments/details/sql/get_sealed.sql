-- THE ENVELOPES, FOR THE ONE ADMIN READ ALLOWED TO OPEN THEM. Never the legacy
-- plaintext columns - those are January's and stay NULL on every row this flow
-- writes. The service that calls this is the only place a decrypted number
-- exists, and it never logs or returns one anywhere else.
SELECT id, account_holder, bank_name, account_type, last_four, email_to,
       method_id, routing_number_encrypted, account_number_encrypted,
       encryption_key_id
  FROM payments.details
 WHERE id = $1
