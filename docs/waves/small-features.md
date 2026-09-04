# small-features — leads, reviews, media, refiners, sales-tax, transactions

Six of the remaining features get REST-shaped transport, a `@dorado/client`
hook package, and the frontend repointed off the legacy axios/`useApiQuery`
transport. The API side of all six (`domain/`, `db/`) was already clean going
in — an earlier repo-wide pass had already moved every throw into a `rules.ts`,
derived every write shape from `@dorado/contracts`, and removed every
hand-listed column array (rulings 64-65). What was left was: REST route shapes
(D214 item 4), `packages/client` hook folders that did not exist yet, three
local builder `*Options` types, and pointing the frontend at the new hooks.

## Route changes (D214 item 4: verb is the method, ids in the path, POST → 201)

| Feature | Old | New |
|---|---|---|
| leads | `GET /leads/get_one?lead_id=` | `GET /leads/:id` |
| | `GET /leads/get_all` | `GET /leads` |
| | `POST /leads/create {lead}` | `POST /leads` (201, bare `LeadPatch`) |
| | `POST /leads/update {lead_id,patch}` | `PATCH /leads/:id` (bare patch) |
| | `DELETE /leads/delete {lead_id}` | `DELETE /leads/:id` (no body) |
| reviews | `GET /reviews/get_one?review_id=` | `GET /reviews/:id` |
| | `GET /reviews/get_all` | `GET /reviews` |
| | `GET /reviews/get_public` (unguarded) | `GET /reviews/public` (unguarded) |
| | `POST /reviews/create {review}` | `POST /reviews` (201, bare `ReviewPatch`) |
| | `POST /reviews/update {review_id,patch}` | `PATCH /reviews/:id` |
| | `DELETE /reviews/delete {review_id}` | `DELETE /reviews/:id` |
| media images | `POST /images/upload` | `POST /images` (201, same mint) |
| | `GET /images/get_test_image` (admin) | `GET /images` (admin, same guard) |
| | `GET /images/get_url?image_id=` | `GET /images/:id/url` |
| | `DELETE /images/delete {id}` | `DELETE /images/:id` |
| sales-tax | `POST /tax/get_sales_tax` | `POST /tax` (zero frontend callers — verified by grep before renaming) |
| transactions | `GET /transactions/get_transactions` | `GET /transactions` |
| refiners | unchanged | unchanged — already REST-shaped (`PATCH /refiners/items/by-order-item/:id`, `PATCH /refiners/orders/:id`, `GET /suppliers/get_all` kept on its historical spelling per `api/app.ts`'s own comment) |

`api/transport/media/pdfs/**` and `media/emails/**` were left alone on purpose:
they are order-triggered actions, not resource CRUD, and reshaping them isn't
this pass's job.

## `packages/client` — five new/relocated hook folders

- `packages/client/src/leads/` — `useLeads`, `useCreateLead`, `useUpdateLead`,
  `useDeleteLead`.
- `packages/client/src/reviews/` — `useReviews`, `usePublicReviews`,
  `useCreateReview`, `useUpdateReview`, `useDeleteReview` (the last has no
  frontend caller yet — five-verb parity with the API).
- `packages/client/src/media/` — `useImages` (renamed from `useTestImage`),
  `useUploadImage` (mints via `POST /images`, then a raw `fetch` PUT to the
  presigned storage URL — that PUT is not a call to our own API, so it's
  correctly exempt from the client-boundary lint), `useDeleteImage`.
- `packages/client/src/refiners/` — relocated verbatim from
  `frontend/features/refiners/queries.ts` (`useAdminSuppliers`,
  `useRefinerOrder`, `useRefinerMetals`, `useRefinerItems`,
  `usePatchRefinerItem`, `usePatchRefinerOrder`). Zero URL renames. The three
  reads take `{enabled?}` instead of reading auth state directly (the package
  imports only `@dorado/contracts`, `react`, `react-query`).
- sales-tax: no hook folder — no consumer exists (checked, not assumed).
- transactions: already had a hook (`packages/client/src/users/queries.ts`'s
  ledger read); its one URL literal was updated for the route rename.

`packages/client/src/keys.ts` gained `leads`, `reviews`, `media.images`, and
`refiners` (`suppliers`/`order`/`metals`/`items`) key-factory blocks; refiners'
hooks were also switched from raw literal arrays to `keys.refiners.*` for
consistency with the rest of the package. `packages/client/src/index.ts`
exports all four new folders.

## Builder fixes (`lint:input-shapes`)

Three local `*Options` types closed and removed from the lint's `ACCEPTED`
map:

- `LeadOptions` → `Partial<LeadPatch> & { id?: string }`.
- `ReviewOptions` → `Partial<ReviewPatch> & { id?: string }` plus a separate
  `opts: { user?: {id:string}|null }` fourth parameter (`user_id` was never a
  column `reviews.create` writes — it's a follow-up `UPDATE`).
- `EngagementOptions` → the dead `mirror` flag (zero real call sites, verified
  by grep) was deleted outright; `bid`/`ask` became
  `Partial<Pick<RefinerSpot, "bid" | "ask">>` from `@dorado/contracts`.

## Frontend

`frontend/features/{leads,reviews,media}/queries.ts` now import their hooks
from `@dorado/client` under the same exported names, so `LeadsAdminTable.tsx`,
`LeadsDrawer.tsx`, `PrioritySelect.tsx`, `ReviewsAdminTable.tsx`,
`ReviewsDrawer.tsx`, `ReviewsLandingSection.tsx`, `ImageUpload.tsx`, and
`app/images/page.tsx` needed no logic changes (one hook rename,
`useTestImage`→`useImages`, touched its one call site). No embedded business
logic was found in any of those UI files. `frontend/features/{media,reviews}/
types.ts` were deleted — their one-off exports had exactly one importer each
(the old queries.ts) and are gone with it.

`frontend/features/refiners/queries.ts` is now a thin re-export of
`@dorado/client`, mirroring `features/rates/queries.ts`. Its consumers —
`editRefinerValues.tsx`, `editActualValues.tsx`, `AdminPreparing.tsx` (all
under a frozen `frontend/features/**/admin/**` path) and
`frontend/features/products/queries.ts` — needed zero import changes since
hook names didn't move. `frontend/app/admin/page.tsx` (frozen) needed **no**
edits at all.

`AdminPreparing.test.tsx` (orders' admin test, not otherwise this lane's) did
need a fix: it mocked `/suppliers/get_all` and `/orders/:id/refiners` through
the legacy `@/shared/queries/axios` stub, which stopped intercepting once those
reads moved onto `@dorado/client`'s own `fetch`. Moved those two fixture
responses into the test's existing `fetch` stub, alongside `/shipments` which
was already there from an earlier lane's conversion.

`api/scripts/lint-client-boundary.ts`'s `PENDING` map lost its
`frontend/features/media` and `frontend/features/refiners` entries — both
converted, both verified green with the entries gone.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @dorado/client typecheck` | exit 0 |
| `pnpm --filter @dorado/client test` | 26/26 pass |
| `pnpm --filter @dorado/frontend typecheck` | exit 0 |
| `pnpm --filter @dorado/frontend test` | 31 files / 175 tests pass |
| `pnpm --filter @dorado/api validate:wire` | 33 endpoints match, 0 diverge, 3 skipped for want of a fixture (pre-existing, unrelated) |
| `pnpm check:fast` | api-lint and api-test groups both green; the only failure is `figma:inventory` (7 pre-existing findings, unrelated to this pass — Jacob's) |

## Left for later

- `media/pdfs` and `media/emails` transport stays RPC-shaped (order-triggered
  actions, not this pass's job).
- `useDeleteReview` has no frontend caller yet.
- `LeadsAdminTable.tsx`'s create form sends `email: email || 'null'` — the
  literal string, not an actual null — on a blank field. Pre-existing, not
  fixed here (out of scope; noted so it isn't rediscovered as new).
