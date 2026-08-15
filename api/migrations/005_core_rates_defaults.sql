-- Match core.rates' column defaults to exchange.rates.
--
-- Same class of difference the leads move turned up: the columns agree, the
-- defaults do not. exchange.rates defaults created_by and updated_by to
-- 'Dorado Admin'; core.rates has no default, so an insert omitting them would
-- write NULL where the old schema wrote a name.
--
-- core.rates also leaves both nullable where exchange has them NOT NULL. That
-- is a relaxation rather than a conflict, and with the defaults in place an
-- insert produces the same row either way. Tightening core to match is left for
-- the constraint pass, once production null counts are known.
--
-- The data is already in sync - 16 rows, matching ids, no differing content -
-- so this migration needs no backfill.

ALTER TABLE core.rates ALTER COLUMN created_by SET DEFAULT 'Dorado Admin';
ALTER TABLE core.rates ALTER COLUMN updated_by SET DEFAULT 'Dorado Admin';
