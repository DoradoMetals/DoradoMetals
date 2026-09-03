# @dorado/contracts

Every type that crosses between the API and a client lives here, and every one
of them traces to a database column.

## Layout

One file per database entity, mirroring the database:

```
src/<schema>/<table>.ts     the entity          orders/items.ts
src/<schema>/enums.ts       the schema's Postgres enums, emitted once
src/<schema>/index.ts       the schema's table namespaces      (generated)
src/schemas.ts              the schema namespaces              (generated)
src/index.ts                schemas.ts plus computed/
src/computed/               shapes no table backs
```

## Naming

The schema and the table are the namespaces; the shape's role is the export.

```ts
import { orders, products, checkout } from "@dorado/contracts";

orders.orders.Row        // the table, generated from information_schema
orders.orders.Read       // what GET /orders serves
orders.orders.View       // one order, assembled from its tables
orders.items.New         // what a create accepts
orders.items.Patch       // what a patch accepts
products.bullion.Public  // the catalogue columns a customer may see
orders.enums.Direction   // the Postgres enum, emitted once in its own schema
```

`Row` is always the table. `New` and `Patch` are always write bodies. Anything
else is a named read or a named body, and says what it is (`Read`, `View`,
`Public`, `Details`, `Summary`, `CreateBody`, `CancelBody`).

A schema whose name is a JavaScript reserved word is exported with a `_schema`
suffix - `public_schema`, and only that one.

## The generated region

Each entity file opens with a region the generator owns:

```ts
// generated:start
export const Row = z.object({ ... });
export type Row = z.infer<typeof Row>;
// generated:end
```

`pnpm --filter @dorado/contracts generate` rewrites that region from
`information_schema` and leaves everything below it alone. It creates a missing
entity file and never deletes one: a dropped table is REPORTED by
`pnpm --filter @dorado/api verify:fresh`, which regenerates into a temporary
directory and compares regions, rather than removed with the derivations
somebody wrote on it.

## The rule below the region

Everything under `// generated:end` is a `.pick()`, `.omit()` or `.extend()` of
a `Row` - this entity's, or another entity's. No hand-written column lists:
`lint:contracts-derived` (in `pnpm check`) fails a `z.object(...)` outside a
generated region that declares a field of its own rather than composing
schemas. Genuinely new data - a parcel's weight, a quantity nothing stores -
goes through `.extend()`, where it is visible as an addition to a row instead
of hiding inside a list that looks like a table.

`src/computed/` is the one exception, and the lint pins it from both sides: a
new file there fails until it is declared, and a declared file that stops
needing the exception fails too. It holds what no table backs - the quote
surface's arithmetic, and the carrier catalogue the provider adapter assembles.
