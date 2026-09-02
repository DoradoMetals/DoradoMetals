-- The envelopes, for the one admin read allowed to open them. Never the
-- plaintext columns - those are January's and stay NULL on every row this
-- flow writes.
SELECT id, account_holder, bank_name, account_type, last_four, email_to,
       routing_number_encrypted, account_number_encrypted, encryption_key_id,
       (SELECT type FROM payments.methods m WHERE m.id = d.method_id) AS method
  FROM payments.details d
 WHERE d.id = $1
