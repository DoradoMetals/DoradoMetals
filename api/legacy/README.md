# `api/legacy/` — the dual-write mirrors, in one place

Jacob, refining ruling 29: *"Move all legacy code to a folder called `legacy`
that is a sibling to `features`."*

**The point of this directory is that promotion deletes one directory.**
Thirteen scattered `legacy/` subfolders would be the same hunt we have today
with better names. One directory is a single `rm -rf` and a single grep to
prove nothing imports it.

## What is in here

The **exchange half of every dual write** whose feature has not been promoted.
Each entry mirrors the feature it came from, so the origin stays obvious:

```
legacy/<feature>/repo.ts      was features/<feature>/legacy.repo.ts
legacy/<feature>/sql/*.sql    was features/<feature>/sql/legacy/*.sql
legacy/<feature>/tests/       a test whose SUBJECT is in here (ruling 31)
```

Imported as `#legacy/<feature>/repo.ts` — the subpath is declared in
`package.json` beside `#features/*`. Never by a relative path crossing between
the two roots.

## What is NOT in here, and why

- **Legacy TABLES.** They stay in the database, always. No migration drops an
  `exchange` schema, table or column — not on dev, not on prod. They cost disk
  and nothing else, and they are the source every backfill reads from.
- **Anything still load-bearing for a live path.** A module is legacy when the
  new schema has taken over its job and this copy exists to keep `exchange` a
  shadow. A module that is still the *only* implementation of a read or a write
  is not legacy yet, whatever it is named. Moving something in here is a
  statement that it is on death row.
- **Anything already deleted.** Legacy code that protects nothing is not legacy
  code, it is dead code (ruling 29), and git has it.

## Entry criteria — what earns a place in here

1. The feature **dual-writes**: the new schema gets the same row, and this copy
   is the redundant one.
2. Its `*_SOURCE` switch, if it has one, is **not promoted past `dual`**.
3. Deleting it would leave `exchange` no longer a level shadow of the new
   schema — which is what makes it *necessary* legacy rather than dead code.

## Exit criteria — when it may be deleted

**Deletion is gated on promotion, and promotion is Jacob's call.** The order:

1. The feature's data migration is **VERIFIED** — `verify:parity`,
   `audit:coverage`, and the decomposition gates green-or-known-and-explained.
   *"The tests pass" is not evidence that data migrated.*
2. Its reads have **pivoted** to the new schema.
3. Its `*_SOURCE` switch is **promoted past `dual`**, at which point `exchange`
   stops receiving that feature's writes. **This is a one-way door**: flipping
   back loses everything written in between.
4. Only then does the feature's directory in here get deleted, together with
   the `import * as legacy` lines in its service.

## The dependency rule

`features/` may import `legacy/`. `legacy/` should not import `features/`, so
that this directory can be deleted without touching anything else.

Where a legacy repo genuinely needs something shared, it imports from
`#shared/*`. The threads that remain are listed here so a future session does
not have to find them:

- **Two runtime imports** — `legacy/shipping/services/repo.ts` imports
  `updateParams` and `legacy/shipping/tracking/repo.ts` imports `columnsOf`,
  both from their feature's own `repo.ts`. Each is a small helper that builds a
  parameter array shared by both halves of the write; cutting the thread means
  moving the helper into `#shared/` or duplicating it. Do it when the feature is
  promoted, not before — a duplicated helper is a chance for the two halves to
  disagree, which is the exact failure the dual write exists to prevent.
- **Type-only imports** from each feature's `repo.ts` (`Executor`, `LeadRow`,
  `ProductValues`, `Quote`, and their kin). These are erased at runtime and
  describe the input shape both halves take, which is a property of the feature
  rather than of the mirror. They vanish with the directory.

Nothing in `features/` imports a *type* from `legacy/` except
`features/shipping/pickups/service.ts`, which takes `LegacyPickup` as the shape
its callers already build. That one is a real thread and it is named here.
