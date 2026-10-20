-- One stored pdf by id, the facts a download or an attachment needs.
SELECT id, path, size_bytes, checksum, created_at
  FROM media.pdfs
 WHERE id = $1
