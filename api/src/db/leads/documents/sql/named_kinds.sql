-- The document kinds the lead Documents card always lists, available or not.
-- The four named kinds in the design wait on Jacob; the rate sheet is the one
-- that exists today.
SELECT v.kind, /*__document_name__*/ AS name
  FROM (VALUES ('rate_sheet'::media.pdf_kind, 1)) AS v(kind, sort_order)
 ORDER BY v.sort_order
