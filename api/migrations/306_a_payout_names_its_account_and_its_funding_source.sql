-- A PAYOUT NAMES ITS ACCOUNT AND ITS FUNDING SOURCE (rulings 116, 160).
--
-- payments.funding_sources: the accounts a payout is sent FROM, a lookup an
-- owner maintains as rows (ruling 116). A label, an optional mask, one default
-- and a sort order; no bank numbers. Seeded with "Dorado operating" as the
-- default.
--
-- orders.transactions gains `payout_bank_link_id` (the linked account the
-- Create Order drawer chose to pay to) and `payout_funding_source_id` (the
-- source it pays from). payments.transfers gains `funding_source_id`, copied
-- from the order when the payout transfer is opened.
--
-- Additive: one new table with one seeded row, three nullable columns.
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS payments.funding_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  mask text,
  is_default boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_pkey') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_label_key') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_label_key UNIQUE (label);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_label_is_written') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_label_is_written
      CHECK (btrim(label) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_mask_is_four_digits') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_mask_is_four_digits
      CHECK (mask IS NULL OR mask ~ '^[0-9]{4}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_created_by_id_fkey') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_sources_updated_by_id_fkey') THEN
    ALTER TABLE payments.funding_sources ADD CONSTRAINT funding_sources_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS funding_sources_one_default
  ON payments.funding_sources (is_default) WHERE is_default;

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.funding_sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO payments.funding_sources (label, is_default, sort_order)
VALUES ('Dorado operating', true, 0)
ON CONFLICT (label) DO NOTHING;

ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS payout_bank_link_id uuid,
  ADD COLUMN IF NOT EXISTS payout_funding_source_id uuid;

ALTER TABLE payments.transfers
  ADD COLUMN IF NOT EXISTS funding_source_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_payout_bank_link_fk') THEN
    ALTER TABLE orders.transactions ADD CONSTRAINT transactions_payout_bank_link_fk
      FOREIGN KEY (payout_bank_link_id) REFERENCES payments.bank_links (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_payout_funding_source_fk') THEN
    ALTER TABLE orders.transactions ADD CONSTRAINT transactions_payout_funding_source_fk
      FOREIGN KEY (payout_funding_source_id) REFERENCES payments.funding_sources (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_funding_source_fk') THEN
    ALTER TABLE payments.transfers ADD CONSTRAINT transfers_funding_source_fk
      FOREIGN KEY (funding_source_id) REFERENCES payments.funding_sources (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_payout_bank_link
  ON orders.transactions (payout_bank_link_id) WHERE payout_bank_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_payout_funding_source
  ON orders.transactions (payout_funding_source_id) WHERE payout_funding_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transfers_funding_source
  ON payments.transfers (funding_source_id) WHERE funding_source_id IS NOT NULL;
