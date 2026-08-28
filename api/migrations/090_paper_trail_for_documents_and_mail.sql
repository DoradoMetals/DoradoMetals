-- Every document an order generates, and every email the business sends.
--
-- Jacob's directive (2026-08-28): orders generate PDFs which attach to them
-- by id, with a type; and there is a record of every email sent, from
-- go-live forward - the historical sends are gone and no backfill can
-- invent them, so these tables start empty and that is correct, not a gap.
--
-- Three decisions, made deliberately (with Jacob, same session):
--   1. PDF rows are IMMUTABLE - regeneration inserts a new row, the latest
--      wins for display, and the paper trail keeps what a customer or
--      refiner was actually sent. There is no updated_at because there are
--      no updates.
--   2. Emails record BOTH outcomes - status sent|failed with the error -
--      because a refiner email that silently failed is exactly the incident
--      this log exists to surface (sendOrderToSupplier's whole guard stack
--      is about that failure class).
--   3. PDFs are generated AT STATUS EVENTS and stored once; email
--      attachments and downloads read the stored file, so what-was-sent has
--      one truth. The bytes live in object storage like media.images; the
--      row carries the pointer and the checksum.
--
-- media.emails.user_id follows payments.details' precedent and references
-- exchange.users directly - users have not migrated and the reference is
-- real. pdf_id links the attachment a send carried.

CREATE TYPE media.pdf_kind AS ENUM (
  'packing_list',
  'return_packing_list',
  'invoice',
  'sales_order_invoice'
);

CREATE TYPE media.email_kind AS ENUM (
  'purchase_order_created',
  'purchase_order_accepted',
  'sales_order_to_supplier'
);

CREATE TYPE media.email_status AS ENUM ('sent', 'failed');

CREATE TABLE media.pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind media.pdf_kind NOT NULL,
  order_id uuid REFERENCES orders.orders(id),
  path text NOT NULL,
  size_bytes bigint,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "The order's documents" is the read: latest of a kind first.
CREATE INDEX pdfs_order_kind_idx ON media.pdfs (order_id, kind, created_at DESC);

CREATE TABLE media.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind media.email_kind NOT NULL,
  status media.email_status NOT NULL,
  to_address text NOT NULL,
  subject text,
  order_id uuid REFERENCES orders.orders(id),
  user_id uuid REFERENCES exchange.users(id),
  pdf_id uuid REFERENCES media.pdfs(id),
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX emails_order_idx ON media.emails (order_id, sent_at DESC);
CREATE INDEX emails_user_idx ON media.emails (user_id, sent_at DESC);
