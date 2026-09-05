-- superseded-by-genesis: every table it alters is either gone (core.*, orders.offers) or
--   already carries the columns in genesis; there is nothing left for it
--   to add.
--
-- Audit columns become user ids, in the new schemas only.
--
-- exchange keeps its text columns and is not touched. This is the shape going
-- forward.
--
-- Why: the text values cannot identify anyone. Two users are named 'Jacob
-- Johnson', and that string is roughly half of all audit entries, so nearly
-- half the trail is ambiguous by construction. Four further values - 'Dorado
-- Admin', 'Dorado Metals Exchange' and two variants - are column defaults
-- rather than people, and nothing prevents a fifth spelling appearing.
--
-- Expand, not replace: the uuid columns are added alongside the text ones,
-- which stay as the original record. They come out in a later migration, once
-- the API writes ids and nothing reads the text. Nothing is lost at any point.
--
-- The backfill maps every existing value to the main admin account, per Jacob,
-- who confirmed that account has done all or most of the work. 'Pedro Gonzalez'
-- is mapped to his own account instead - he is a real admin with work
-- attributed to him, and folding him in would rewrite who did it.
--
-- Rows whose text column is null stay null: no actor was recorded, and
-- inventing one would make the trail worse, not better.
--
-- shipping.packages is absent because it already uses uuid audit columns.

ALTER TABLE core.bullion
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE core.leads
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE core.organizations
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE core.rates
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE core.reviews
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE fulfillments.fulfillments
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE fulfillments.methods
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE orders.offers
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE payments.details
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE payments.intents
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE payments.methods
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

ALTER TABLE shipping.services
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES auth.users(id);

UPDATE core.bullion SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE core.leads SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE core.organizations SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE core.rates SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE core.reviews SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE fulfillments.fulfillments SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE fulfillments.methods SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE orders.offers SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE orders.orders SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE orders.transactions SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE payments.details SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE payments.intents SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE payments.methods SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;

UPDATE shipping.services SET
  created_by_id = CASE WHEN created_by IS NULL THEN NULL
                       WHEN created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END,
  updated_by_id = CASE WHEN updated_by IS NULL THEN NULL
                       WHEN updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
                       ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END;
