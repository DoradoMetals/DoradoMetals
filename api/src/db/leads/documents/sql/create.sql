-- One statement: the link is written and the view is read back off the same
-- pdf row, so the caller never needs a second round trip.
WITH link AS (
  INSERT INTO leads.documents (lead_id, pdf_id)
  VALUES ($1, $2)
  RETURNING id, lead_id, pdf_id, created_at
)
SELECT link.id, link.lead_id, link.pdf_id,
       to_char(link.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       p.kind, p.path, p.size_bytes, p.checksum,
       to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS uploaded_at
  FROM link
  JOIN media.pdfs p ON p.id = link.pdf_id
