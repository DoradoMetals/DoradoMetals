-- A REFINER LOT CITES THE INVOICE LINE IT CAME FROM.
--
-- `refining.orders.statement_reference` names the whole statement. The adopt
-- dialog draws `31% of ELM-88433` as a link, and the settlement-line matcher
-- pre-matches our lots to the refiner's lines by that reference - neither has
-- anything to point at while the only reference is per order.
--
-- One nullable text column on the lot, written on the REFINER side only (the
-- lot a batch minted), by Record settlement and by a parsed statement. A
-- customer lot never carries one: it has no line on anybody's invoice.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE inventory.lots ADD COLUMN IF NOT EXISTS line_reference text;

CREATE INDEX IF NOT EXISTS lots_line_reference
  ON inventory.lots (line_reference) WHERE line_reference IS NOT NULL;
