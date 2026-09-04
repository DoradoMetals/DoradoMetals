INSERT INTO media.pdfs (id, kind, order_id, path, size_bytes, checksum)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
