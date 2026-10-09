-- The link row plus the pdf's own facts, joined here rather than stitched in
-- TypeScript (ruling 71). `uploaded_at` is the pdf's created_at; the link's
-- own created_at says when it was attached to this lead.
SELECT d.id, d.lead_id, d.pdf_id,
       to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       p.kind, p.path, p.size_bytes, p.checksum,
       to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS uploaded_at
  FROM leads.documents d
  JOIN media.pdfs p ON p.id = d.pdf_id
 WHERE d.lead_id = $1
 ORDER BY p.created_at DESC, d.id DESC
