-- Match core.leads' column defaults to exchange.leads.
--
-- The two tables agreed on columns, types and nullability but not on defaults,
-- which a response diff between the old and new implementations caught: an
-- insert that omitted `contact` produced a value under exchange and NULL under
-- core.
--
--   contact   exchange defaults to 'Jacob Johnson', core had none
--   priority  exchange defaults to 'Medium', core had none - the column was
--             added by migration 002 without carrying its default across
--
-- Defaults are part of the contract whether or not anyone intended them to be,
-- so they are matched here rather than papered over in application code. The
-- 'Jacob Johnson' default is preserved deliberately: this migration is for
-- switching schemas without changing behaviour. Whether a person's name belongs
-- in a column default is a separate question, worth asking separately.

ALTER TABLE core.leads ALTER COLUMN contact  SET DEFAULT 'Jacob Johnson';
ALTER TABLE core.leads ALTER COLUMN priority SET DEFAULT 'Medium';
