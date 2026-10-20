-- One of a lead's documents by its pdf id ($1 lead, $2 pdf), named as the list names it.
SELECT d.id, d.lead_id, d.pdf_id,
       to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       p.kind, p.path, p.size_bytes, p.checksum,
       to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS uploaded_at,
       /*__document_name__*/ AS name
  FROM leads.documents d
  JOIN media.pdfs p ON p.id = d.pdf_id
 WHERE d.lead_id = $1 AND d.pdf_id = $2
