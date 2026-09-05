INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
