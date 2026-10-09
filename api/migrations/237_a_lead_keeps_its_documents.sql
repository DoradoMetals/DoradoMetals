-- A LEAD KEEPS DOCUMENTS, AND THE PDF ROW IS NEVER DELETED.
--
-- media.pdfs keys on an order or a refiner order and is append-only: a row
-- there records a file the business issued or was given, and nothing removes
-- one. A lead's documents are therefore a LINK TABLE - leads.documents -
-- so DELETE /api/leads/:id/documents/:pdfId unlinks and the pdf row stays.
-- ON DELETE RESTRICT on pdf_id says that in the schema rather than in a
-- comment; the lead side cascades, because a deleted lead has no links.
--
-- `lead_document` joins media.pdf_kind. The order documents each have a
-- renderer and a name; an imported lead document has neither, so it needs a
-- kind of its own rather than borrowing `invoice`. 174 is the precedent for
-- adding a label, and a label is never removed from this type: the rows that
-- carry one are documents already issued.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TYPE media.pdf_kind ADD VALUE IF NOT EXISTS 'lead_document';

CREATE TABLE IF NOT EXISTS leads.documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  pdf_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_pkey') THEN
    ALTER TABLE leads.documents ADD CONSTRAINT lead_documents_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_lead_fk') THEN
    ALTER TABLE leads.documents ADD CONSTRAINT lead_documents_lead_fk
      FOREIGN KEY (lead_id) REFERENCES leads.leads (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_documents_pdf_fk') THEN
    ALTER TABLE leads.documents ADD CONSTRAINT lead_documents_pdf_fk
      FOREIGN KEY (pdf_id) REFERENCES media.pdfs (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lead_documents_lead_pdf
  ON leads.documents (lead_id, pdf_id);
CREATE INDEX IF NOT EXISTS lead_documents_lead ON leads.documents (lead_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
