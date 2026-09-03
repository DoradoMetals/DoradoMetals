-- A record of one send, sent or failed - both outcomes are rows; a failed send is the incident this log exists to surface.
INSERT INTO media.emails
  (kind, status, to_address, subject, order_id, user_id, pdf_id, provider_message_id, error)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
