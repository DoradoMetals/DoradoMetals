-- A LEAD HAS A NUMBER OF ITS OWN.
--
-- Ruling 125 gave the four ORDER prefixes one shared sequence so a bare
-- number is unique across all of them. A lead is not an order: it is not
-- paid, shipped or documented, and a LEAD-7 beside an SO-7 names two
-- unrelated things that never meet on a document. So it gets its own
-- sequence, leads.number_seq, and its own prefix.
--
-- `number` is text and carries the prefix, unlike orders.orders.number which
-- is a bigint the reference format prefixes at read time. A lead reference
-- has exactly one shape, so the shape belongs in the column default and
-- nothing has to re-spell it in SQL or TypeScript.
--
-- NOT NULL is safe here and is not inferred from dev row counts: the column
-- is brand new, the loop below gives every existing row a value in
-- (created_at, id) order, and the default fills every row written after this.
-- The assertion before SET NOT NULL proves it rather than trusting it.
--
-- audit_stamp is suspended for the backfill: numbering a lead is not an edit
-- an employee made, and letting the trigger fire would stamp today's
-- timestamp and the migrating actor onto every lead in the table.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE SEQUENCE IF NOT EXISTS leads.number_seq AS bigint;

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS number text;

ALTER TABLE leads.leads DISABLE TRIGGER audit_stamp;

DO $$
DECLARE
  r       record;
  stamped bigint := 0;
BEGIN
  FOR r IN SELECT id FROM leads.leads WHERE number IS NULL ORDER BY created_at, id LOOP
    UPDATE leads.leads
       SET number = 'LEAD-' || nextval('leads.number_seq')
     WHERE id = r.id;
    stamped := stamped + 1;
  END LOOP;
  RAISE NOTICE 'leads.leads: % row(s) numbered in (created_at, id) order', stamped;
END $$;

ALTER TABLE leads.leads ENABLE TRIGGER audit_stamp;

ALTER TABLE leads.leads
  ALTER COLUMN number SET DEFAULT 'LEAD-' || nextval('leads.number_seq'::regclass);

DO $$
DECLARE
  missing bigint;
BEGIN
  SELECT count(*) INTO missing FROM leads.leads WHERE number IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'refusing SET NOT NULL: % lead(s) still carry no number', missing;
  END IF;
END $$;

ALTER TABLE leads.leads ALTER COLUMN number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_number_unique ON leads.leads (number);
