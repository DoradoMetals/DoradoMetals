-- A generated document, persisted immutably. Regeneration inserts a new row
-- rather than updating one - see the repo header.
INSERT INTO media.pdfs (id, kind, order_id, path, size_bytes, checksum)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
