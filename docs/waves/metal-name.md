# Metal is its name (ruling 79)

Jacob, 2026-09-06: "thoughts on making the metal_id the actual name? So we
don't have to do the weird shit with joins and such." Then: "We could just
replace the ids with the metal names, and get rid of the name column." A
cascade on rename is fine (his call); metals are a fixed vocabulary of four
(Gold, Silver, Platinum, Palladium) that nothing customer-created touches.

## The shape

`metals.metals.id` becomes `text PRIMARY KEY` holding the name; the `name`
column goes. Every `metal_id` column keeps its NAME and becomes
`text REFERENCES metals.metals(id) ON UPDATE CASCADE`, holding 'Gold' and
friends. No column is renamed anywhere, so the change is a type and a value,
not a sweep. Any join that existed only to read the metal's name dies: the id
is the name.

## Migration 132 (nothing in `exchange` moves)

Eight tables carry `metal_id uuid`: `products.bullion`, `checkout.items`,
`orders.items`, `orders.spots`, `rates.rates`, `refiners.items`,
`refiners.spots`, `spots.spots`. In one migration:

1. Drop the eight FKs to `metals.metals(id)`.
2. `metals.metals`: add the text id from `name`, swap the primary key, drop
   the uuid and `name`.
3. Each of the eight: `ALTER COLUMN metal_id TYPE text USING (select the name
   for the uuid)`; `NOT NULL` stays exactly where it was.
4. Re-add the eight FKs `REFERENCES metals.metals(id) ON UPDATE CASCADE`.
5. Constraints and indexes that lead with `metal_id` keep working
   (`spots_one_per_metal`, `rates_no_overlap_qty` with `metal_id WITH =`);
   confirm with `audit:indexes`, `audit:query-paths`, `audit:constraints`.

`migrate` against dev, regenerate `000_genesis_schema.sql`, regenerate the
contracts (`metal_id: z.string()`; `Metal` is `{ id }` plus whatever
attributes remain). `lint:migrations` green: no exchange write.

## Backfills

Every backfill that resolved `metal_id` through a name lookup now copies the
name (`029` catalogue, `031` orders, spots, rates, refiner spots). They must
reproduce dev exactly: `verify:backfill` is in the gate and must stay at zero
undeclared differences; `verify:genesis` must pass.

## Code

Drop every join whose only purpose was the metal's name (pricing reads, the
order view, checkout item lists, refiner reads, pdf and email inputs, the
`metalNames` map in `checkout/rules.ts`). Rewrite from the inputs inward
(ruling 78). Tests and builders pass names where they minted metal rows.
`validate:wire` green.

## Not in scope

Mints and everything customers create keep their ids. Frontend untouched
(its breakages listed in the doc). `exchange` untouched.
