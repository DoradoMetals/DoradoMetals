# The first real navigation (nav lane)

Jacob, looking at the placeholder home: *"probably need to add some stuff to the
header/footer. Lets get some routes there. We can start with an 'admin' route
that just takes us to an individual order screen for now."*

Worktree `nav-lane`. `frontend/` and `packages/client` only; the API did not
change, and nothing in Figma was re-drawn — every component on screen is one the
library already ships (ruling 96).

Before this lane the chrome pointed at nothing. `AppShell` passed the Header no
`nav` at all, and `/admin/orders/<id>` was a URL you had to already know: the
admin screens ruling 100 built had no way in that was not typed by hand.

## The link table, by who is looking

**Every link resolves.** That is the one rule the file lives by, and it is why
the table is short: Figma's Header draws How It Works / Pricing / About /
Contact / Login and a Get a Quote button, and five of those six routes were
deleted by the nuke (ruling 99). A nav entry appears the day its page does.

| slot | signed out | signed in (customer) | signed in (admin) |
|---|---|---|---|
| Header nav | Home | Home | Home, **Admin** |
| Header trailing | `Sign in` link | avatar + account menu | avatar + account menu |
| Drawer (mobile) | Home, Sign in, Create an account | Home, Email, Phone, Sign out | Home, Admin, Email, Phone, Sign out |
| Footer "Account" | Sign in, Create an account | Email, Phone | Email, Phone |

The account menu is the library's `Menu` with the library's `Avatar` as its
trigger: a `MenuLabel` "Account", the session's own name (its email when it has
no name), a separator, a `MenuLabel` "Settings" over the two screens that exist
(`/settings/email`, `/settings/phone`), a separator, and Sign out in `danger`
intent. The avatar's fallback is the initials of the same two fields.

The drawer behind the hamburger carries the nav entries and the account entries
in one list, because the mobile bar is brand and hamburger only (Figma `51:57`)
and that is where the rest of the header goes. Nav links use `Link variant="nav"`
with `active={pathname === href}`, which is the library's own current-page
treatment rather than a class this app invents.

**The footer has one column and that is not an oversight.** `Footer` renders
whatever `columns` it is handed, so a Company column is one array entry away —
but About, Contact and Careers do not exist as routes, and a footer link that
404s is worse than a footer that is short. The library also draws an optional
`legalLinks` row (`legalHeading` defaults to "Legal") and a `social` slot; both
are left empty for the same reason. Admin still wears no footer at all
(`docs/waves/app-shell.md`).

## The admin index

`app/admin/page.tsx` is four lines — the role guard is the layout's, and
`error.tsx` / `loading.tsx` were already there. The composition is
`app/admin/_src_/AdminIndex.tsx`: two `DataTable`s, both searchable, both paged
at 25, each row's primary cell a link into the screen that already exists.

| table | hook | route | columns | row links to |
|---|---|---|---|---|
| Orders | `useOrders` | `GET /api/orders` | Order, Direction, Status, Placed | `/admin/orders/[id]` |
| Refiner orders | `useRefiningOrders` | `GET /api/refining/orders` | Order, Refiner, Direction, State, Created | `/admin/refining/[id]` |

States come from the library: three `Skeleton` bars while a read is in flight,
`EmptyState` inside the table when the API answers an empty list, and a second
`EmptyState` in place of the table when the read is refused (react-query does
not throw, so `app/admin/error.tsx` would never see it).

**Nothing is computed in the browser.** A cell is a field of the row the API
answered with; the only transformation is `format.ts`'s `when()` on a timestamp
and `DASH` for a null.

## What the library lacked: nothing. What the API lacked: two columns

No component was added and none was changed — `Header` already exposed a `nav`
slot it was never passed, `Footer` already took arbitrary columns, and
`DataTable`, `Menu`, `Avatar`, `Skeleton` and `EmptyState` needed no edit. The
gaps this lane found are in the **list route**, and they are recorded rather
than worked around:

- **`GET /api/orders` serves no `reference`.** "PO-2481" is built in
  `db/orders/sql/view.sql`, for the single-order view only; the list answers
  `OrderRead[]`, which is the `orders.orders` row plus its totals. Ruling 83
  says the browser does not decide that prefix, so the table shows the order
  **number** and the e2e spec looks the row up by the number the API gives it.
- **`GET /api/orders` serves no customer.** The row carries `user_id` and
  nothing else about the customer; a uuid is not a name, and joining
  `GET /api/users` in the browser would be a second list read and a join the
  API is the right place for. So there is **no Customer column** until the list
  route grows one.

The refiner list has neither problem: `GET /api/refining/orders` answers the
same `RefiningOrderView` the screen reads, so the refiner's organization name
and the order's state are already fields.

## `@dorado/client`

Two hooks, two query-key namespaces, both mirroring their route exactly. The
filters travel through `apiRequest`'s `params` argument rather than being baked
into the URL, so the call site stays the literal string
`api/src/shared/http/tests/frontend-routes.test.ts` counts.

| hook | route | filters |
|---|---|---|
| `useOrders` | `GET /orders` | `direction`, `user_id` (admin only, per the route) |
| `useRefiningOrders` | `GET /refining/orders` | `refiner_id`, `direction`, `state` |

`keys.orders.list(direction, userId)` and
`keys.refining.list(refinerId, direction, state)` key on what was ASKED for, not
on what came back.

## Tests

- `frontend/shared/tests/appShell.test.tsx` — nine tests over the three session
  states. Every assertion is on `href`s, so a link that stops resolving is a
  failure rather than a styling diff. The drawer is opened through the real
  hamburger and the account menu through Radix's keyboard path, which is the
  one jsdom implements faithfully.
- `frontend/app/admin/_src_/tests/adminIndex.test.tsx` — five tests: loading,
  empty, rows (both tables), and a refused read.
- `app/admin/orders/[id]/_src_/tests/adminOrder.e2e.ts` gained three: the
  header's Admin link lands on the index, the index lists the seeded order and
  clicks through to its screen, and `/admin` bounces a signed-out visitor.

Gates run in this worktree: frontend `typecheck` 0, `@dorado/client` typecheck 0,
`vitest run` 176/176, `next build` green (`/admin` is a static route),
`lint:client-boundary` 0 findings (119 frontend files, 29 client),
`frontend-routes.test.ts` green, and the five e2e above passing against a local
API and frontend on ports 5099/3099.

## Where `shared/types/routes.ts` stands

It gained one entry, `admin: { path: '/admin', roles: ['admin'], seoIndex: false }`,
and the admin layout's guard reads that instead of `adminOrder`'s. The point is
`robots.ts`: it disallows every non-indexable path, and `/admin/orders` being
listed never covered `/admin` itself. The file is still two fields and two
consumers — the labels the nav draws live with the nav, not in a route table.
