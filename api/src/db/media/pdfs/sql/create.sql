INSERT INTO media.pdfs (kind, order_id, refining_order_id, path, size_bytes, checksum)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
