# Customers, Leads and the Inbox: admin screens

Drawn 2026-09-12 in Figma **Orders** (`ymmNlCDLVIfanpRQ7QHMIs`). Everything sits
in a section `Draft · for review · 2026-09-12` on its page; new local components
sit on **Components** in `Draft · Customers · 2026-09-12` (`688:35714`) and
`Draft · Leads · 2026-09-12` (`688:35715`), below every existing section with
200px gaps. Nothing of Jacob's was edited — library components are instantiated,
never changed.

Desktop is 1440 (content 1376), the width of `Admin / Purchase Order — PO-2481`.
Mobile is a 390 viewport with 358 of content. Badge colours follow the Orders
language: Warning → Info → Success for pre → mid → post, Danger for problems,
Neutral Outline for not set.

Pages: `Customers` (`1:2`), new page `Leads` (`688:35711`), section
`688:35713` and `688:35712` respectively.

## Deviations from the brief, up front

| asked for | what was drawn | why |
|---|---|---|
| `Page Header` local component `656:15023` on every list page | the **library `Admin Header`** (`75e3f5a3312c…`, main `687:13850`) | `Page Header` has been superseded. `Admin / Orders & Lots` now carries `Admin Header`, a published library component that is the same pattern grown up: nav tabs, breadcrumb, title + chips + description, search, and a filter toolbar. Using it keeps Customers, Leads and Inbox identical to Orders and Inventory, and obeys "library components only". The Page Header instances it replaced are gone from the Orders screen. |
| Leads chips `All · New · Contacted · Responded · Converted` | desktop shows `All · New · Contacted · Responded` | `Admin Header` has four chip slots. Mobile shows all five (chips are drawn there, not instanced from the header). |
| filter row separate from the header | the header's own toolbar carries the filters | `Admin Header` owns a toolbar of four Selects, a count and Reset. Drawing a second filter row below would double the chrome. |

## 1 · Customers list — Customers page

| name | frame id | states | what the API must provide |
|---|---|---|---|
| `Admin / Customers` | `694:24895` | filled | `GET /api/users` (admin) — `accounts/users/routes.ts:12`. Returns `AdminUser[]`. |
| `Admin / Customers · Empty` | `694:35854` | no matches | same endpoint, empty array |
| `Mobile · Customers` | `694:59890` | filled | same |
| `Mobile · Customers · Empty` | `696:55076` | no matches | same |

Per column, against `AdminUser` (`packages/contracts/src/auth/users.ts:31`):

| column | source | verdict |
|---|---|---|
| Name | `AdminUser.name` | exists |
| Phone | `AdminUser.phone_number` | exists |
| Email | `AdminUser.email` | exists |
| Orders count | — | **new**. No order count on the user row. Needs a count per user in the list view's SQL. |
| Open orders | — | **new**. Same; "open" means the derived display state is not `Completed`/`Cancelled` (`docs/design/statuses.md`, Section 3). |
| Credit balance | `AdminUser.dorado_funds` | exists |
| Last contact | — | **new**. Latest `crm.sms_messages` / `crm.calls` row for the user. The timeline view already computes this shape per customer; the list needs it as one column. |
| Assigned to | — | **new**. No owner column on `auth.users`. An `assigned_to` FK to `auth.employees` is the smallest change. |
| State badge (Active / Banned) | `User.banned`, `banReason`, `banExpires` | **`AdminUser` omits all three** (`auth/users.ts:34-40`). The badge cannot be drawn from today's response. Either stop omitting them or add a derived `state`. |

Filters drawn: `Open orders`, `Credit`, `Assigned to`, `Sort by` — all **new**
as query parameters; `GET /api/users` takes none today. Chips
`All · Active · Banned` need the ban fields above. Search is **new**.

## 2 · Customer screen — Customers page

| name | frame id | states | what the API must provide |
|---|---|---|---|
| `Admin / Customer — Marguerite Whitfield` | `694:42889` | Active | see per-card table |
| `… · Banned` | `694:54285` | Banned | ban fields, above |
| `Mobile · Customer — Marguerite Whitfield` | `694:70663` | Active | same |
| `Admin / Customer · Adjust credit` | `694:55783` | are-you-sure over the screen | `POST /api/users/:id/credit` |

| card | what it draws | endpoint |
|---|---|---|
| header | eyebrow `CUSTOMER`, name, `since Mar 2025 · Austin, TX`, state badge, `Assigned to` select, `Message` · `Call` · `New order` · `Ban` (Danger tertiary) | `GET /api/users/:id` (`accounts/users/routes.ts:14`). `Assigned to` options: `GET /api/employees` (`accounts/employees/routes.ts:8`) or `GET /api/users/admins`. Assignment write is **new**. Ban write is **new**. |
| `Details` | phone, email, verified badge per channel, addresses with default markers | `GET /api/users/:id` gives `phone_number_verified` and `email_verified`. Addresses: `GET /api/addresses` is **`requireUser` and scoped to the caller** (`accounts/places/addresses/routes.ts:16`) — an admin reading another customer's addresses is **new**. |
| `Orders` | rows with the Order State badge (`664:12789`), total, link | `GET /api/orders` is `requireUser` and returns the caller's orders (`orders/routes.ts:35`). A by-customer admin listing is **new**. The badge's ladder is the derived display state from `docs/design/statuses.md` Section 3 — also **new** (today `orders.orders.status` is a free string). |
| `Credit` | balance, ledger rows, `Adjust credit` | balance: `AdminUser.dorado_funds`. **Ledger rows are new** — there is no credit-movement table; `POST /api/users/:id/credit` mutates the balance and writes no history. `Adjust credit` is an override-class money action: the drawing puts an are-you-sure with **Operation**, **Amount** and a required **Reason** in front of it. `UpdateCreditBody` is `{ op, amount }` only (`auth/users.ts:52`) — **`reason` is new, and so is the ledger row it writes**. |
| `Payout accounts` | method and last four only | `GET /api/payments/details/:id` (`transactions/details/routes.ts:11`) is per payment-detail id, not per customer. A by-customer listing is **new**. Numbers are never drawn: `GET /api/payments/details/:id/bank` stays the one admin-only opener. |
| `Timeline` | one row pattern, kind icon, orders / messages / calls / emails / notes | `GET /api/customers/:id/timeline` — **note the mount is `/api/customers`, not `/api/users`** (`app.ts:123`, `crm/timeline/routes.ts:7`). `CustomerTimeline` carries `kind` of `sms | call | email` only (`computed/crm.ts:47`). **Order and note kinds are new.** |
| `Messages` | library Chat, Messages view | `GET /api/sms?user_id=` (`crm/sms/routes.ts:7`), `POST /api/sms` with `SmsSendBody` |
| `Calls` | library Chat, Calls view | `GET /api/calls/:id` per call (`crm/calls/routes.ts:9`). **A per-customer call list is new** — only the timeline returns calls in bulk today. `POST /api/calls/token` and `/presence` back the softphone. |
| `Notes` | note text plus author and date | **new**. No notes table for customers. |

## 3 · Leads list — Leads page

| name | frame id | states | what the API must provide |
|---|---|---|---|
| `Admin / Leads` | `695:48285` | filled | `GET /api/leads` (`crm/leads/routes.ts:7`) |
| `Admin / Leads · Empty` | `695:48631` | no matches | same |
| `Mobile · Leads` | `696:54435` | filled | same |
| `Mobile · Leads · Empty` | `696:54643` | no matches | same |

| column | source (`Lead`, `packages/contracts/src/leads/leads.ts:8`) | verdict |
|---|---|---|
| Name, Phone | `name`, `phone` | exists |
| Priority badge | `priority` — `text DEFAULT 'Medium'`, unconstrained | exists as a string; **should become an enum** (`statuses.md` Section 1 says `rename to an enum`). Drawn as High / Medium / Low. |
| Stage badge | derived from `contacted`, `responded`, `converted` | **new as one field**. The three booleans exist; nothing derives the stage. Ladder `New → Contacted → Responded → Converted`. |
| Assigned to | — | **new**. No owner column on `leads.leads`. |
| Last contacted | `last_contacted` | exists |
| Created | `created_at` | exists |
| Source | `contact` is the closest column; the drawing shows `Sell form · gold scrap` | **new** as a first-class field. |

Description `48 leads · 6 unowned · median 4h to first contact` needs the owner
column and a first-contact metric — both **new**. Filters `Priority`,
`Assigned to`, `Source`, `Sort by` and search are **new** query parameters.

## 4 · Lead screen — Leads page

| name | frame id | states | what the API must provide |
|---|---|---|---|
| `Admin / Lead — Dwight Okafor` | `695:54075` | New | `GET /api/leads/:id` |
| `Mobile · Lead — Dwight Okafor` | `696:54809` | New | same |
| `Admin / Lead · Convert` | `695:55689` | are-you-sure, pre-filled | **new** |
| `Admin / Lead · Delete` | `695:55788` | are-you-sure | `DELETE /api/leads/:id` (`crm/leads/routes.ts:11`) |

| card | endpoint |
|---|---|
| header — stage badge, `Priority` select, `Assigned to` select, `Message` · `Call` · `Convert to customer` · `Delete` | `PATCH /api/leads/:id` with `LeadPatch` covers priority and the three stage booleans (`leads/leads.ts:27`). `Assigned to` is **new**. |
| `Details` — phone, email, contact preference, source, notes | `Lead.phone`, `.email`, `.contact`, `.notes` exist. `contact` is doing double duty as both preference and source; the drawing separates them — **one of the two is new**. |
| `Timeline` | **new for leads.** `GET /api/customers/:id/timeline` keys on `auth.users`; `crm.sms_messages` matches inbound texts to a customer by verified phone (`communications-plan.md`). A lead has a phone and no user row, so nothing binds its texts and calls to it today. |
| `Messages`, `Calls` | `GET /api/sms?number=` accepts a bare number (`crm/sms/controller.ts:37`) — that is the hook a lead conversation hangs on. Sending needs `user_id` (`SmsSendBody`, `computed/crm.ts`), so **outbound to a lead is new**. |
| `Convert` dialog — pre-filled name / phone / email, creates the customer, keeps the timeline | **new**. Creating the `auth.users` row and re-pointing the lead's texts and calls at it has no endpoint. `LeadPatch.converted` only flips a boolean. |

## 5 · Inbox — Customers page

| name | frame id | states | what the API must provide |
|---|---|---|---|
| `Admin / Inbox` | `694:78100` | desktop split, list left + Chat right | **new** |
| `Mobile · Inbox` | `694:78427` | list only; selecting navigates | **new** |

Every conversation in one list, newest first, unread first. Row: customer or
lead name, last message preview, channel icon, time, unread dot, assigned to.
This is where forwarded texts and voicemails land for the on-duty employee
(`communications-plan.md`, Texts → Forwarding).

The whole screen is **new**. Nothing today returns conversations across
customers: `GET /api/sms` takes one `user_id` or one `number`. It needs a
conversations index — one row per counterparty with the last message, an unread
count and an owner. Unread has no column anywhere. Assignment has no column
anywhere. Voicemails arrive as `crm.calls` rows with `status = 'voicemail'`
(`crm/calls/rules.ts:16-17`) and a `recording_url`, so the Calls side of the
list has a source; the reply bridge and the dial-out bridge sit behind
`POST /api/sms/inbound` and `POST /api/calls/twiml` and do not change the shape
of this screen.

## 6 · Local components

`Draft · Customers · 2026-09-12`, Components page (`688:35714`):

| component | id | properties |
|---|---|---|
| `Customer State` | `689:33828` | `State=Active` (Success/Soft) · `Banned` (Danger/Soft) |
| `Customer Header` | `694:37634` | `State=Active` · `Banned`; `Name`, `Meta` text |
| `Customer Row / Head` | `689:35635` | column heads, same widths as the row |
| `Customer Row` | `689:35626` | 8 text properties, one per column |
| `Customer Row / Mobile` | `689:37110` | 6 text properties over three lines |
| `Detail Line` | `692:36954` | `Label`, `Value`, `Show badge` |
| `Address Row` | `692:36962` | `Line 1`, `Line 2`, `Show default` |
| `Ledger Row` | `692:36970` | `Date`, `Reason`, `Amount`, `Balance` |
| `Payout Account Row` | `692:36975` | `Method`, `Last four`, `Show default` |
| `Timeline Row` | `693:44443` | `Kind icon` (instance swap: package / message-square / phone / mail / pencil), `Summary`, `Detail`, `Time` |
| `Inbox Row` | `693:38522` | `Unread=True` · `False`; `Name`, `Preview`, `Time`, `Assigned to` |

`Draft · Leads · 2026-09-12`, Components page (`688:35715`):

| component | id | properties |
|---|---|---|
| `Lead Stage` | `689:33851` | `New` · `Contacted` (Warning/Soft) → `Responded` (Info/Soft) → `Converted` (Success/Soft) |
| `Lead Priority` | `689:33868` | `High` (Danger/Soft) · `Medium` (Info/Soft) · `Low` (Neutral/Outline) |
| `Lead Row / Head` | `689:37136` | column heads |
| `Lead Row` | `689:37120` | 5 text properties plus two swappable badges |
| `Lead Row / Mobile` | `695:57152` | 4 text properties plus two swappable badges |

## 7 · What the library could not draw

1. **The library `Dialog` has no body slot.** Its properties are `Title`, `Body`
   (one string) and `Show close`; an instance's children cannot take a form
   field. The `Adjust credit`, `Convert` and `Delete` panels are therefore
   composed frames wearing the Dialog's own tokens — `surface/highest`,
   `border/default` at `stroke/hairline`, `radius/base`, `spacing/md` padding
   and gap, an `h4` title, a `body` line, library `Input` and `Select`
   instances, and a `SPACE_BETWEEN` footer of library `Button`s. **The Dialog
   component needs a slot** if confirms are ever to carry a reason field, which
   this one must.
2. **`Header` has no `Layout=Mobile, Signed In=True` variant.** The five
   variants are Desktop×{Signed In, Drawer Open} plus Mobile×{Drawer Open}. Every
   mobile screen therefore wears `Layout=Mobile, Drawer Open=False, Signed
   In=False` and shows a signed-out chrome on an admin screen. One more variant
   fixes it.
3. **`Admin Header` carries four chip slots, and the Leads list wants five.**
   Desktop drops `Converted`; mobile draws all five as loose `Chip` instances.
4. **`Admin Header` has no multi-toggle.** `Has open orders` and `Has credit`
   were asked for as toggles; its toolbar offers one exclusive radio pair and
   four Selects, so both are drawn as Selects (`Open orders → Any`,
   `Credit → Any`). A toggle row would need a new slot or a separate filter row.
5. **`Accordion` ships a demo body.** `Open=True` renders a three-line `Content`
   frame under the header. Every card title row in this draft hides that child
   per instance, the same workaround Jacob's order cards use. A `Show content`
   boolean would remove the need.
6. **`Admin Header`'s breadcrumb sits right-aligned on the Inbox and
   left-aligned on Customers**, from the same instance settings. It is inside
   Jacob's component and was left alone.
7. **No credit-ledger row component existed and none could**, because no such
   data exists — `Ledger Row` is drawn against a table that has yet to be built.
