# The API — db, domain, http

Three layers, enforced by import roots and a `lint:layers` script in the
style of `lint:db`. An untracked sketch of all of this lives at
`api/example/` (in `.git/info/exclude`); nothing in it runs.

```
api/
  db/        one folder per TABLE.  CRUD only.        imports: #db, @dorado/contracts
  domain/    one folder per WORKFLOW,                  imports: #db/*, #domain/*, #shared/*, #providers/*
             one file per USE CASE
  http/      routes + controller per surface.          imports: #domain/* only.  URLs never move (ruling 13).
```

## db — one folder per table, five verbs

```
getOne(id, tx?)            -> Row | null
listFor(parentId, tx?)     -> Row[]        (list(tx?) for reference tables; listByIds where the caller holds ids)
create(row: RowNew, tx?)   -> Row
update(id, patch, tx?)     -> boolean      (true = exactly one row changed)
remove(id, tx?)            -> boolean
```

Types come from `@dorado/contracts`. No repo computes anything, calls
another repo, or writes `INSERT … SELECT`. `orders.update(id, patch, guard)`
keeps its guard: `(user_id, direction)` is what stops a write landing on
someone else's row, and it is still one function per table.

## domain — one folder per workflow, one file per use case

- **One public function per file, named for the action the UI offers.**
  `place-purchase.ts`, `edit-line.ts`, `record-settlement.ts`,
  `lock-from-pool.ts`. Not `write.service.ts`. The public surface of the
  domain is exactly the list of things a customer or admin can do.
- **Parameters are ids the client holds plus genuinely new information, and
  the actor.** Nothing else crosses the wire.
- **The use case owns the transaction.** Helpers take `tx`. Outside-world
  calls (FedEx, Stripe, email) sit before or after, never inside — the
  existing law, now visible in the file's shape.
- **Pure rules live in `rules.ts`.** Rows in, values out, no executor, no db
  import. Content, price, premium tiers, `latestStage`, "which stage prices
  this order", "may this fulfillment method serve this direction". Tested
  without Postgres.
- **Reads anywhere, writes through the owner.** Any domain file may read any
  db folder — CRUD reads carry no rules to bypass. Writing another
  workflow's tables goes through that workflow's use case, because that is
  where its rules live.
- **Authorization is transport.** Admin and customer run the same use case
  with a different actor.
- **Not every feature becomes a workflow.** Catalog, pricing inputs and
  places are reference data: a db folder and perhaps a read. Recaptcha,
  Places and FedEx are `providers/`. The domain folder ends up with roughly
  eight to ten workflows, not twenty-six.

Likely workflows: `orders`, `checkout`, `fulfillment`, `shipping`,
`payment`, `payout`, `refining`, `users`, `content` (leads, reviews, media).

## http — parse, call one use case, send

A controller parses the contract from the request, calls one domain
function, sends the result. It never imports `#db`. The URL a handler serves
is the URL it served before the file moved.

## No prop spreading

Jacob: *"Remove all prop spreading across the api. FUCK prop spreading."*
Every create and update spells its columns. The one defensible spread is a
table row into its view shape in a composed read, and even that should be
looked at twice.

## The one composed read per workflow

`domain/orders/read.ts` assembles the drawer shape from N CRUD reads and
prices it through `rules.ts`. It is the one legitimately wide file. If it
gets slow, the CRUD-consistent answer is a database view with one `getOne`,
and that is a schema change to decide separately.
