SELECT id, account_holder, bank_name, account_type, last_four, email_to,
       method_id, routing_number_encrypted, account_number_encrypted,
       encryption_key_id
  FROM payments.details
 WHERE id = $1
