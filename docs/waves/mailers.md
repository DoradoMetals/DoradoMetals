# The mailers are the design now (ruling 95, 2026-09-07)

Jacob: *"add a lane for updating our pdfs/mailers too."* Figma file **Media**
(`WkbKhVaAYmxKTsbmAQEwmk`), the single page `0:1` "Mailers": five symbols and
thirteen mailer frames. Every customer email the API sends is built from them.

## The system

`domains/documents/theme.ts` holds the ONE visual system both documents wear -
the type ramp, the spacing steps, the radius, the font stack and two palettes.
Both are read off the design's variables:

| token | mailer (`screen`) | paper (`paper`) |
|---|---|---|
| background | `#09090c` | `#ffffff` |
| card | `#101114` | `#fbfbfc` |
| border | `#2c2f35` | `#dfe1e6` |
| foreground | `#f6f7f9` | `#111318` |
| muted | `#9499a4` | `#5c6270` |
| primary / on | `#fafafa` / `#0d0e11` | `#111318` / `#ffffff` |

Ramp: micro 12/17.4 (+0.048 tracking), small 13/19.5, h3 22/28.6 (-0.33),
h1 36/41.4, code 40/48 (+8). Spacing 4/8/16/24/32, radius 8, width 600 outer /
536 inner. **The gold is retired on both documents.**

### The base layout and the five partials

- `emails/render/base.ts` - `renderMailer(preheader, blocks)`. 600px, tables
  only, inline styles, no flex and no grid, images by absolute URL, a `<style>`
  block that carries the mobile breakpoint and NOTHING a mailer needs to be
  correct (Gmail strips it). Every coloured cell carries a `bgcolor` ATTRIBUTE
  beside its inline style, and the head declares `color-scheme` /
  `supported-color-schemes`, because Gmail and Outlook apply their own
  dark-mode transforms on top of a dark email. **That is a mitigation, not a
  proof** - the design's own note says every mailer must be looked at in a real
  client before it ships, and none of these has been.
- `emails/render/parts.ts` - Email Header (4:810), Email Footer (4:873), Email
  Code (5:109), Email Row (5:115), Email Card (164:1151), plus the Button and
  Stat the mailers place beside them, and `esc()`. A card with no rows renders
  no box at all.
- `emails/render/mask.ts` - `maskEmail` (`j•••@domain`) and `maskPhone`
  (`(•••) •••-0134`), the auth design's rules. Applied by
  `rules.detailsChangedRows`, which is the only way those rows are built.
- `emails/links.ts` - every button's destination. FedEx's own tracking page, a
  Google Calendar template URL built from the booking's start, a Maps search
  built from the office the read named.

### One template per mailer, one SQL read per mailer

`emails/templates/<mailer>.ts` exports `subject()` and `render(mail)`. The COPY
is the design's, verbatim, and lives in the template. Every DYNAMIC value comes
from a single SQL read parsed by its own contract - `db/media/emails/sql/
content_*.sql` and `packages/contracts/src/computed/documents.ts`. **A card row
is a row of the read**: the label and the figure are built in SQL, so no
template stitches a dictionary (ruling 78).

## The mapping

| old `media.email_kind` | mailer (Figma node) | trigger | SQL read |
|---|---|---|---|
| `purchase_order_created` + `sales_order_created` | **Order received** (6:173), direction-aware | `place.ts` / the Stripe webhook, via `sendOrderPlacedConfirmation` | `content_order_received.sql` |
| `purchase_order_priced` | **Document sent** (214:904), label "Invoice" | `POST /api/emails/purchase_order_priced` | `content_document_sent.sql` |
| — (new `document_sent`) | **Document sent** (214:904) | `sendDocument(order_id, label, bytes, pdf_id)` | `content_document_sent.sql` |
| — (new `payout_sent`) | **Payout sent** (6:260) | `orders/transactions/service.ts` `payoutRecorded`, called by `orders/service.ts` `addFunds` after commit | `content_payout_sent.sql` |
| — (new `shipment_sent`) | **Shipment sent** (154:808) | `logistics/shipping/operations` `getTracking`, after the scan rows commit | `content_shipment_sent.sql` |
| — (new `shipment_received`) | **Shipment received** (154:881) | same call, same moment | `content_shipment_received.sql` |
| — (new `pickup_booked`) | **Pickup booked** (211:659) | `POST /api/fulfillments/schedule_pickup`, after commit | `content_pickup_booked.sql` |
| — (new `pickup_complete`) | **Pickup complete** (211:704) | `POST /api/fulfillments/set_status`, when a PICKUP is marked collected | `content_pickup_complete.sql` |
| — (new `appointment_booked`) | **Appointment booked** (211:747) | `POST /api/fulfillments/schedule_direct`, after commit | `content_appointment_booked.sql` |
| — (new `appointment_tomorrow`) | **Appointment tomorrow** (211:790) | the `appointment reminders` cron job, daily | `content_appointment_tomorrow.sql` + `appointments_tomorrow.sql` |
| `auth_verification` (sign-up half) | **Account created** (154:954) | better-auth's verification callback, and the magic link | none - the caller supplies the contract |
| — (new `sign_in_code`) | **Sign-in code** (6:107) | THE AUTH LANE'S | none |
| — (new `details_changed`) | **Details changed** (154:1010) | THE AUTH LANE'S | none |
| — (new `promo`) | **Promo** (154:1083) | **none, deliberately** - marketing is later | none |

`sales_order_to_supplier` is NOT in the design and did not move: it goes to a
refiner, not a customer, and keeps `salesOrderToSupplier.raw.html`.

### The gates are in the SQL, not in the caller

Three reads refuse to answer rather than printing a half-truth, so a trigger can
fire as often as it likes:

- `content_shipment_sent.sql` requires a tracking number AND a status that is
  not `Label Created`. A customer told their metals were on the move while the
  box was still on their table is the one thing that row must not do.
- `content_shipment_received.sql` requires a delivered parcel (`in_hand > 0`).
- `content_appointment_*.sql` require `is_appointment`, so a walk-in gets
  nothing.

And every once-per-order mailer asks the trail first (`sentAlready`): no flag
column, no in-memory set, nothing that can drift from the rows.

### The reminder is idempotent because the trail is

`appointments_tomorrow.sql` selects appointments whose start falls on **tomorrow
in `America/Chicago`** - not in UTC, because a 7pm CT booking is a different UTC
day - and excludes every order that already has a sent `appointment_tomorrow`
row. The job is therefore a loop and nothing else; a second run the same day
sends nothing, and a missed tick is caught by the next one.
Schedule: `APPOINTMENT_REMINDER_SCHEDULE` (unset = the job logs and skips, like
its three siblings).

## Exported for the passwordless-auth lane

All three take a CONTRACT, so zod has already checked the shape. All three file
their trail row BEFORE the failure travels on, and all three throw if the
transport refuses. Pass a transport in tests - nothing in a test run may reach a
real mailbox.

```ts
import * as emails from '#documents/emails/service.ts'
import { detailsChangedRows } from '#documents/emails/rules.ts'

// kind `sign_in_code`
await emails.sendSignInCode(
  { order_id: null, user_id, email, name, code: '418209', expires_in_minutes: 10 },
  transport?, executor?
)

// kind `account_created`
await emails.sendAccountCreated({ order_id: null, user_id, email, name, url }, transport?, executor?)

// kind `details_changed` - `changed` names the field in words, `changed_at` is
// already formatted for a reader. detailsChangedRows MASKS both values; never
// build those rows by hand.
await emails.sendDetailsChanged(
  {
    order_id: null, user_id, email, name,
    changed: 'Email address',
    changed_at: 'Sep 3 at 4:18 PM CT',
    rows: detailsChangedRows('Email address', previous, next),
  },
  transport?, executor?
)
```

`sendAuthVerificationEmail(user, url, isSignUp)` still exists and still routes
the sign-up half through `sendAccountCreated`. The `verifyEmail`,
`resetPassword` and `changeEmail` raw templates and their renderers are UNTOUCHED
and are the auth lane's to delete.

## What died

- `templates/accountCreated.raw.html`, `createAccount.raw.html`,
  `purchaseOrderPlaced.raw.html`, `salesOrderPlaced.raw.html`,
  `orderPriced.raw.html` and their five `renderEmail.ts` functions.
- `emails/service.ts` `sendCreatedEmail` (replaced by `sendOrderReceived`, which
  takes an order id rather than a pre-built document and an address) and the
  unrouted `emails/controller.ts` `sendCreatedEmail` with it.
- The hand-kept `EmailKind` union in `record.ts`: it is `Email['kind']` now, so
  the enum is the one definition and migration 141 could add twelve labels
  without a second edit.

## Migration 141

`141_a_mailer_for_every_moment.sql` appends twelve labels to `media.email_kind`.
Additive, `IF NOT EXISTS`, no table touched, no row rewritten, `exchange`
untouched; `lint:migrations` green. **Applied to dev only.** Genesis and
`packages/contracts/src/media/enums.ts` carry the twelve labels by hand rather
than by regeneration, because dev has moved under this worktree (137-140 belong
to the closing review lane) and a full `dump:schema` / `generate` here would
have pulled their schema changes into this branch's diff.

`auth_verification` is NOT removed: the verify/reset/change-email templates are
still live, their rows already carry the label, and dropping an enum label means
rewriting every row that has one.

## The PDFs

**There is no Figma page for the PDFs, and they still want one.** What this lane
did is bring `documents/pdfs/render/layout.ts` onto the mailers' system:

- the type ramp, the spacing steps and the radius come from `theme.ts`;
- `#debb59` is gone - the filled gold band behind every section header and the
  gold rule under the logo are a quiet card ground and a hairline now;
- `.detail-row` and `.invoice-card-row` are the Email Row (label left, figure
  right, hairline between); `.shipping-box`, `.details` and `.invoice-card` are
  the Email Card (1px border, radius 8, quiet ground);
- a footer carrying the same postal line the Email Footer does.

**Not one class name, cell or number changed.** `sections.ts` and `service.ts`
are untouched, which is what lets the packing-list and invoice content tests
stand exactly as they were - including `<td>- g</td>` and the `<tr>` count.

The face is still **Poppins** while the mailers ask for Geist: a mailer can name
a font and let the client fall back, but a PDF is rendered here and the file has
to exist in `api/src/shared/assets/fonts` - no Geist woff2 is in this repo.
Dropping a weight pair in there and changing three lines is the whole job.

## Tests

**246 files, 1473 tests, green.**

- `emails/tests/mailers.test.ts` - a rendering test per mailer: the design's copy
  is present, the masked values are present and the RAW ones are not, no
  `undefined` / `null` / `NaN` / `[object Object]`, no unfilled placeholder, and
  every mailer wears the shell (600 wide, the dark ground, the logo, the postal
  address, unsubscribe, no flex or grid, no external stylesheet). Plus the two
  that matter most: an empty card draws no box, and a row value carrying markup
  is escaped rather than rendered.
- `emails/tests/triggers.test.ts` - each new trigger through the stub transport:
  the row is filed, the mailer says what it should, a second call sends nothing,
  an unscanned parcel and an undelivered one send nothing, a walk-in is not an
  appointment, and the reminder job's second run in the same day sends nothing.
- `emails/tests/paper-trail.test.ts`, `service.test.ts`, `replay.test.ts` follow
  the new senders; the routes and their guards are unchanged.
- `pdfs/tests/*` are UNCHANGED and green.

## Changed outside this lane's own files

- `shared/testing/builders/shipping.ts` minted a colliding tracking number:
  `` `7941${aTag()}`.slice(0, 12) `` dropped the last digit of the counter, so
  the second and third shipment of a file shared a number. Migration 136's
  UNIQUE index turned that from an invisible collision into two failing tests in
  `shared/middleware/tests/ownership.test.ts`, **failing at the branch tip before
  this lane touched anything**. The tag now leads.
- `shared/http/tests/endpoints.test.ts` lost the `UNROUTED` entry for the
  controller handler that no longer exists.
- `shared/cron/tests/scheduler.test.ts` names the fourth job.
- `domains/accounts/auth/client.ts`: ONLY the magic link's renderer moved
  (`renderCreateAccountEmail` -> the Account created template). The passwordless
  lane owns what that callback does next; `emails.sendAccountCreated` is the
  version that also files a trail row.
- `lint-contracts-derived.ts` gained the `computed/documents.ts` COMPUTED entry.

## Shape changes for the one frontend pass

None. No route, no URL and no request body moved. `POST
/api/emails/purchase_order_priced` answers exactly as it did.
