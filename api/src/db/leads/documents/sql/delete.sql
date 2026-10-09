-- The LINK goes; the media.pdfs row is append-only and is never touched.
DELETE FROM leads.documents WHERE lead_id = $1 AND pdf_id = $2
