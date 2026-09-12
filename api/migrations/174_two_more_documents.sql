-- Two document kinds the drawings added: a public RATE SHEET (Figma
-- 129:752) and ASSAY RESULTS (Figma 225:2270), the per-lot measurement page
-- for a purchase order.
--
-- Settlement and Lot Manifest stop being offered in the same pass, but their
-- LABELS stay: dropping an enum label means rewriting every row that carries
-- one, and `media.pdf_kind` is the column of a table that holds documents the
-- business has already issued. The code's own list is what shrank.
--
-- Additive. No table touched, no row rewritten, `exchange` neither read nor
-- written.

ALTER TYPE media.pdf_kind ADD VALUE IF NOT EXISTS 'rate_sheet';
ALTER TYPE media.pdf_kind ADD VALUE IF NOT EXISTS 'assay_results';
