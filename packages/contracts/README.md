# @dorado/contracts

Every type that crosses between the API and a client lives here, and every one
of them traces to a database column.

## Layout

One file per database entity, mirroring the database:

```
src/<schema>/<table>.ts     the entity          orders/items.ts
src/<schema>/enums.ts       the schema's Postgres enums, emitted once
src/<schema>/index.ts       flat re-export of the schema's entities (generated)
src/schemas.ts              flat re-export of every schema          (generated)
src/index.ts                schemas.ts plus computed/
src/computed/               shapes no table backs
```

`exchange` is NOT generated. The legacy schema is frozen, nothing in `api/` or
`frontend/` imports one of its rows, and the backfill and audit scripts read it
through their own raw SQL.

## Naming

ONE FLAT NAMESPACE. The export is the entity's own name:

```ts
import { Rate, RatePatch, Order, OrderItem, BullionStorefront } from "@dorado/contracts";
```

A collision is resolved by the name the code already uses for the concept -
`orders.items` is an `OrderItem`, `checkout.items` a `CheckoutItem`,
`refiners.items` a `RefinerItem`, `places.addresses` an `Address` - never by a
schema prefix.

- the entity is the table: `Rate`, `Order`, `Checkout`, `Bullion`, `Payout`
- **`<Entity>Patch` is the only write type.** A create sends the same patch an
  update does: the database's NOT NULL columns and defaults decide what a
  create needs, and a missing one comes back as the shared pg-error
  translation naming the column. There is no `New<Entity>`.
- named reads say what they are: `OrderView`, `BullionPublic`,
  `BullionStorefront`, `PayoutDetails`, `SpotPrice`, `AdminRate`
- enums are plain: `Direction`, `FulfillmentCategory`, `ShipmentDirection`

## The generated region

Each entity file opens with a region the generator owns:

```ts
// generated:start
export const Rate = z.object({ ... });
export type Rate = z.infer<typeof Rate>;
// generated:end
```

`pnpm --filter @dorado/contracts generate` rewrites that region from
`information_schema` and leaves everything below it alone. The entity's NAME
comes from the `ENTITY` map in the generator - a new table fails the run until
it is named there, which is the one decision a person has to make. The
generator creates a missing entity file and never deletes one: a dropped table
is REPORTED by `verify:fresh`, which regenerates into a temporary directory and
compares regions.

## The rule below the region

Everything under `// generated:end` is a `.pick()`, `.omit()` or `.extend()` of
an entity - this file's, or another's. No hand-written column lists:
`lint:contracts-derived` (in `pnpm check`) fails a `z.object(...)` outside a
generated region that declares a field of its own rather than composing
schemas. Genuinely new data - a quantity nothing stores - goes through
`.extend()`, where it is visible as an addition to a row instead of hiding
inside a list that looks like a table.

`src/computed/` is the one exception, and the lint pins it from both sides: a
new file there fails until it is declared, and a declared file that stops
needing the exception fails too. It holds what no table backs - the quote
surface's arithmetic, and the carrier catalogue the provider adapter assembles.
