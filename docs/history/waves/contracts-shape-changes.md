# Contracts: write-body shape changes (D214 item 3, contracts-bodies lane)

Every body-accepting endpoint outside `orders` now parses a `@dorado/contracts`
schema in strict mode: an unknown key or a wrong-typed value is a 400 before
the service runs. Per ruling 44 the frontend is not consulted here and is not
touched by this lane - it adapts after, in one pass, against a stable API.
This file is that pass's input: every request shape that changed, old to
new, and the frontend files a grep found sending the old one.

No response shape changed in this lane. Every change below is a REQUEST body.

## leads

**POST /leads/create** and **POST /leads/update**

- `created_by` / `updated_by` are no longer accepted fields (they were never
  written - `public.audit_stamp` stamps them from the connection's actor).
  Sending either is now a 400.
- `user_name` is no longer accepted on `update` (same reason - it existed to
  feed `created_by`/`updated_by`, which no longer exist).
- New: `@dorado/contracts` exports `LeadPatch` (ten fields, matching
  `leads.leads`' own `PATCHABLE`), so `update`'s `patch` is now validated -
  previously it was `z.record(z.string(), z.unknown())`, unchecked.

Frontend files sending the retired fields (grep, not fixed here):
- `frontend/features/leads/ui/LeadsAdminTable.tsx:184-185` (`created_by`,
  `updated_by` in the create body)
- `frontend/features/leads/ui/LeadsDrawer.tsx:85,159,197` (`user_name` in
  three update calls)
- `frontend/features/leads/queries.ts:26-32` (the mutation itself types and
  sends `user_name`)

## reviews

**POST /reviews/create** and **POST /reviews/update**

- `created_by` / `updated_by` are no longer accepted (same audit_stamp
  reasoning as leads). `user_name` is gone from `update` for the same reason.
- `hidden` is non-nullable now (was `z.boolean().nullable()`): `CreateReviewBody`
  was built on `exchange`'s stale `ReviewsRow`; it now points at the live
  `reviews` schema, where the column is `NOT NULL`. This narrows what the
  contract ACCEPTS (`null` is now refused) - it does not change what the
  column ever held.

Frontend files sending the retired fields:
- `frontend/features/reviews/ui/ReviewsAdminTable.tsx:141` (`created_by` in
  the create body)
- `frontend/features/reviews/ui/ReviewsDrawer.tsx`,
  `frontend/features/reviews/queries.ts`,
  `frontend/features/reviews/types.ts` (the mutation's `user_name`/
  `created_by`/`updated_by` plumbing)
- `frontend/features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/Completed.tsx:29`
  and the sales-order twin at
  `frontend/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/Completed.tsx:28`
  (both create a review with `created_by` inline)

## rates

`created_by`/`updated_by` are removed from the base `RateInput` contract, but
`rates/controller.ts` already `.omit()`ted them before this pass - **no
caller-visible behavior changed.** Nothing to adapt.

## products

**POST /products/save_product**

- `metal` / `supplier` / `mint` (NAMES, resolved server-side by an in-memory
  lookup) are GONE. The body now takes `metal_id` / `supplier_id` /
  `mint_id` directly (ruling 43 - ids for what the server holds). An id the
  database doesn't have is now a foreign-key refusal, not a "no such X
  called ..." message.
- The top-level `user` field (the whole session user object, previously sent
  and ignored) is gone; naming it is now a 400.
- Every boolean (`display`, `homepage_display`, `legal_tender`,
  `domestic_tender`, `sell_display`, `is_generic`) must be a real JSON
  boolean now. The old service accepted the strings `"true"`/`"false"` too
  (`flag()`); that coercion is gone with the body shape that needed it.
- The body is now a full-replace `ProductPatch` (every writable column of
  `products.bullion`, plus `id`) - unchanged in spirit from today's form,
  but every field name/type is now enforced.

**POST /products/create_product**

- `created_by` is no longer an accepted field (was accepted and ignored).

Frontend files sending the retired shape:
- `frontend/features/products/queries.ts:85-95` (`useCreateProduct` sends
  `created_by`), `:99-110` (`useSaveProduct` sends `{ product, user }` where
  `product` is the composed `AdminProduct` read shape - `metal`/`supplier`/
  `mint` names, no ids, plus a stray top-level `user`)

## media (images)

**POST /images/upload**

- `path` is GONE. It was already ignored server-side (the object key is
  entirely server-chosen - see `domain/media/images/service.ts`'s own
  comment on why); it is now a 400 rather than a silent no-op.
- `mimeType` -> `mime_type`, `size` -> `size_bytes` (matching
  `media.images`' own column names instead of the ad-hoc camelCase the body
  used before).
- `user_id` in the body is GONE (it was already ignored - the id comes from
  the session); naming it is now a 400 instead of a no-op.

**DELETE /images/delete**

- Only `id` is accepted now. `user_id` in the body (already ignored - the id
  comes from the session) is now a 400.

Frontend files sending the retired shape:
- `frontend/features/media/queries.ts:24-29` (`useUploadImage` sends `path`,
  `mimeType`, `size`, `user_id` - all four need updating)

## places (addresses)

**POST /addresses/create** and **POST /addresses/update**

- `is_valid` / `is_residential` are GONE from the `address` object. Both are
  server-controlled facts (`create.sql` hard-codes `is_valid=true,
  is_residential=false`; a real validation result is written through a
  different endpoint entirely) - the body always sent a value that was
  ignored, and naming either is now a 400.
- Every other field of `address` (`line_1`, `line_2`, `city`, `state`,
  `country`, `zip`, `country_code`, `phone_number`) is unchanged.
  `user_address` (`label`, `default_shipping`) is unchanged.

**DELETE /addresses/delete** and **POST /addresses/set_default**

- No change for a caller already sending `{ address_id, user_id? }` (the
  live shape, confirmed by grep below). The composed `{ address: { id } }`
  fallback the controller used to accept (`address_id ?? address?.id`) is
  gone - a caller relying on that fallback now gets a 400.

Frontend files:
- `frontend/features/addresses/types.ts:106-107,115-119` (`AddressFormValues`
  carries `is_valid`/`is_residential`, and `splitFormValues` forwards them
  straight into the `address` half of the body)
- `frontend/features/addresses/queries.ts:69-91` (`useCreateAddress`,
  `useUpdateAddress` both spread `splitFormValues(values)`, carrying the
  two fields in)
- `frontend/features/addresses/queries.ts:98-118` (`useDeleteAddress`,
  `useSetDefaultAddress` already send `{ user_id, address_id }` - no change
  needed there)

## users

**POST /users/update_credit**

- No field renamed (the body was already `{ user_id, op, amount }` -  `mode`
  had already been dropped from what the SERVICE read, in an earlier pass).
  What changed: an unrecognized key (a stray `mode`, or anything else) is now
  a 400 instead of silently ignored, and `op` is now checked against the
  three-value enum before the service runs rather than inside it.

Frontend: `frontend/features/users/queries.ts:54` sends `/users/update_credit`;
grep found no `mode` field in its body - likely already clean, worth a
one-line confirmation in the frontend pass rather than an assumed fix.

## fulfillments

**POST /fulfillments/methods/update**, **cancel_schedule**, **set_method**,
**set_status**, **schedule_pickup**, **schedule_direct**

- All six are validated for the first time (previously hand-checked with
  `uuidField` or passed straight to the service with no schema at all).
  Field names are unchanged (`fulfillment_id`, `method_id`, `status`,
  `pickup: {...}`, `direct: {...}`); what changed is that an unrecognized
  field in any of them is now a 400.
- `methods/update`'s `method` object no longer accepts `type`, `category`,
  or `direction` (never writable - changing a method's category would move
  its fulfillments to a detail table their rows aren't in) or `id` outside
  the top level.

Frontend: **no consumer exists yet** for any of the six
(`frontend/features/fulfillments/queries.ts`'s own header comment: "NO
CONSUMERS YET, deliberately" - only the three GET reads are wired up).
Nothing to adapt.

## shipping (carriers, carrier_services)

**POST /carriers/create** and **POST /carriers/update**

- `organization.id` is GONE. The service never read it (an update resolves
  the organization to touch via the carrier's own `organization_id`, read
  server-side); naming it is now a 400.
- `update` also no longer accepts the read shape's `created_at`/`updated_at`
  at the top level.
- `logo` and `organization.{name,email,phone,enabled}` are unchanged.

**POST /carrier_services/create** and **POST /carrier_services/update**

- The writable field NAMES are unchanged, including the wire's own aliases
  (`supports_pickup`, `supports_dropoff`, `max_weight_lbs` - not the column
  names `supports_pickups`/`supports_dropoffs`/`max_weight_lb`, which are
  now explicitly refused if sent).
- What is GONE: `created_at`, `updated_at`, `created_by`, `updated_by`,
  `created_by_id`, `updated_by_id`, `max_insured_value`, `price`, `display`
  - none of these was ever written by `create`/`update`; sending them (as
  the read-shape round-trip below does) is now a 400 instead of a no-op.

Frontend files sending the retired shape:
- `frontend/features/carriers/queries.ts:23-29` (`useUpdateCarrier` sends
  the whole composed `Carrier` read type as `{ carrier }` - `organization.id`,
  `created_at`, `updated_at` all need dropping)
- `frontend/features/carriers/queries.ts:61-69` (`useUpdateCarrierService`
  sends the whole composed `CarrierService` read type as `{ service }` -
  the audit/computed columns above need dropping; `useCreateCarrierService`
  at `:51-59` already types its body as `NewCarrierService`, worth
  confirming it doesn't carry the same extras)

## auth, recaptcha, media (pdfs)

No shape change - these three gained strict parsing with the SAME fields
they always took (`newPassword`; `token`; `order_id`). Listed for
completeness against item 1's inventory, not because anything needs
adapting:
- `POST /auth/set_password` - `{ newPassword: string }`
- `POST /recaptcha/verify-recaptcha` - `{ token: string }`
- `POST /media/pdfs/generate_*` (four routes) - `{ order_id: uuid }`; a
  non-uuid `order_id` is now a 400 instead of reaching the database as a
  malformed-input 500.

## Deliberately NOT converted this pass (documented, not silent)

Three surfaces still take a body typed `Record<string, unknown>`/`any` at
the transport boundary. Each is excluded on purpose, not overlooked:

- **`domain/quotes/service.ts:32`** (`type Body = Record<string, any>`) -
  `POST /quotes/catalog|sales_order|purchase_order|order|profit_breakdown`.
  The header comment states why: every field is read defensively at its own
  call site (uuid-checked, liveness-checked) rather than declared, because
  this is the surface the $26.81 spoofed-spot bug lived on - a hasty
  contract here is exactly the kind of change ruling 43 exists to prevent
  hurrying. Belongs with a pricing-focused pass, not a body-parsing sweep.
- **`domain/sales-tax/service.ts:28,45,67,93`** (`item: Record<string,
  unknown>`) - `POST /sales-tax/get_sales_tax`. The body's `items` is
  deliberately loose: `factsFrom`'s own comment documents reading BOTH
  `product_type` and the legacy `type` spelling on purpose, so a strict
  schema picking one would silently break the other caller shape.
- **`domain/shipping/operations/service.ts` and its controller** -
  `POST /shipping/validate_address|get_rates|check_pickup|get_locations|cancel_label|cancel_pickup|get_tracking`.
  These are FedEx passthrough parameters, not rows of any table - there is
  no generated schema to derive a contract from, and building hand-written
  ones is a bigger, separate piece of work than this lane's scope (the
  known-gaps list this lane worked from named carriers/services, not
  operations).
- **`domain/media/emails/service.ts` and `utils/renderEmail.ts`** -
  `POST /media/emails/purchase_order_priced` (and `sendCreatedEmail`, not
  currently routed). Both take the FULL composed order object the PDF/email
  templates render from - the same shape D214 item 12 ("composer death")
  is scheduled to delete outright (`domain/orders/compose.ts`,
  `read.service.ts`, `fragments.ts`). Building a contract for a shape one
  item away from deletion would be thrown away; the recipient-resolution
  security fix already landed here (`recipientFor` - the address comes from
  the stored order, not the body) is unrelated and untouched.

None of the four are inventoried as "converted" in the lane's report; they
are the honest remainder.
