# Jacob's standing rulings

This is the law. A ruling is a decision Jacob made about how this codebase
works. It stands until Jacob supersedes it. Read this file before you design
anything, and do not relitigate a number that is already here.

Cite a ruling by number: `ruling 26b`, `rulings 75-76`. The full story of each
is in the archive at `docs/history/FOLLOWUPS-2026-09-07.md`.

In the archive, rulings 1-39 are a running numbered list and 40-90 have their
own sections; 26b and 26c correct 26, and two different rulings carry the
number 39. Rulings 53, 54, 55, 57, 59-62, 81, 85, 86 and 91-96 were recorded
outside the repository and are written down here for the first time. `Spent`
marks a ruling whose subject no longer exists; `Parked` marks one whose work
was stopped. The number is kept in both cases so it is never reused.

Rulings 97 to 126 were made between 2026-09-08 and 2026-09-22 and lived only in
lane docs and the session memory file
(`~/.claude/projects/-home-jtj60-dorado-exchange/memory/jacobs-design-law.md`,
which `docs/waves/handoff-2026-09-13.md` names as their home). They are written
down here for the first time, each with its source. `Text uncertain` marks a
ruling whose sources disagree; both readings are given.

## Data and the database

- **8 — Legacy code is disposable; legacy tables are not.** *"I no longer care
  about ANY of the legacy code. I only care about the legacy table."* Spent —
  all legacy code is gone; the table half is now the covenant.
- **36 — `exchange` may stop receiving writes.** *"Yes exchange can stop
  receiving those writes."* The deploy order is then absolute; 82 states the
  order it takes today.
- **40 — One row per physical lot.** *"We probably don't need 3 item tables,
  probably only need link tables between them."* Weights and purity become
  append-only measurement rows by stage. Parked — the model redesign stopped.
- **41 — Freeze what changes outside your control; derive the rest.** *"remove
  price and content from the items since they are derivable."* Spot, premium
  and tax rate freeze on the order. Parked with 40.
- **42 — Refiner orders are separate orders.** *"At the end of the day they are
  separate."* No foreign key to the customer order; the lot is the only join.
  Parked with 40.
- **49 — The sell side has no gate.** *"We can show all of them on sell tab. We
  can't show all of them on buy."* `display` gates the buy side only.
  Supersedes 48's measurement that kept `sell_display`.
- **51 — The item row carries every load-bearing value.** *"we should never use
  bullion.weight or whatever to calculate ANYTHING."* A bullion line copies the
  product's facts once. Purchase premium comes from rates, sale premium from
  the bullion's ask premium.
- **72 — Ids are the database's.** *"The database will create ids. WE SHOULD
  NEVER CREATE UUIDS ON THE API OR FRONTEND."* A create omits `id`.
- **76 — Defaults live in the database.** Code sends only what it decided.
  Amended: no id defaults and no name lookups.
- **79 — A metal is its name.** `metals.metals.id` holds `'Gold'` and `name`
  goes. Every `metal_id` becomes a text foreign key with `ON UPDATE CASCADE`.
  Fixed vocabularies only.
- **80 — Products are flair.** An item read carries its own columns plus
  `bullion_id`, never the joined product. The frontend resolves flair from the
  products list. The checkout snapshot is `INSERT … SELECT`.
- **81 — Retire the two auth-to-exchange mirror triggers.** *"Yes migrate and
  retire."* `exchange.carrier_pickups` rows are not carried forward.
- **82 — The production chain is drop and rebuild.** *"Drop and rebuild seems
  to make more sense. As long as it's not dropped exchange."* After the dump,
  the January schemas drop and genesis plus backfills rebuild. Supersedes the
  migrate-in-place backfill step.

## API shape

- **1 — One endpoint per resource.** The order PATCH holds only the order row
  and order-level actions.  Every other resource gets its own endpoint, owned
  by the feature owning its table.
- **2 — A status is a pure label.** Customer-facing progress display only,
  driving no logic anywhere. Side-effectful transitions are named operations,
  such as `finalize_pricing`.
- **3 — Customers have zero order-management options after placing.** The order
  PATCH is admin-only.  The archive twice cites "ruling 3" for *offers are
  fully dead*; that belongs to 2.
- **6 — `refiners.orders` is an entity.** The refiner-side engagement attached
  to a customer order. Every engagement fact lives on it. Parked in part by 42.
- **7 — `orders.transactions` may not need to exist.**  It may be derivable
  from payments plus the credit ledger. A note, not a plan.
- **9 — A resource read returns the bare resource.** *"That's how prop drilling
  gets messy and awful."* A shipment is fetched by order id, never read as
  `order.shipment`.
- **10 — Ids in, data out.** The client sends ids plus genuine user input. It
  never round-trips a composed or derived object to the server.
- **11 — The child points at the parent.** `refiners.orders` carries
  `order_id`; there is no reverse field on the wire. Names follow the resource.
- **12 — Rows on the wire.** A read returns the generated table row and no
  joined scalar: *"The frontend can make do."* One deviation, non-negotiable:
  bank numbers and secrets never go on the wire. Refined by 71 — a view may
  nest, but only in SQL.
- **13 — The URL and the file answer different questions.** A path may sit
  under a parent, but the handler lives with the table. Factoring never moves a
  URL.
- **34 — The pricing API returns prices, not items.** *"We don't want price
  stored on items, as we're dropping that column later because it's derived."*
  Array in, array out.
- **43 — The client sends ids for what the server holds.** *"I want the client
  driving/sending as little data as possible."* A whole shape crosses only for
  a new record: a first address, a scrap declaration, a lead.
- **48 — A direction is parsed once, at the transport.** *"why does this exist
  at all? It's just returning itself lmao."* `Direction` is one contract
  export, parsed strictly at the transport. Services never re-check.
- **50 — Carts are checkout items.** *"The new 'carts' are quite simply
  checkout items."* `/api/cart` is deleted; the basket is `GET|PUT|DELETE
  /api/checkout/items?direction=`. One flat line shape, no union, no type tag.
- **58 — Parcel weight and declared value are the server's.** *"We don't care
  about packaging weight on the frontend. Why would it live here?"* The server
  computes the parcel at label time.
- **59 — Carrier rates are a server read.** *"we don't need to combine shit and
  do all the logic on the frontend at all."* `GET /api/checkout/rates` loads
  the row and items, builds the request in rules, returns flat rate rows.
- **63 — Anonymous checkout is server-side.** *"Fuck it, go for it. We'll need
  it anyway."* A visitor gets an anonymous user, and sign-in links the account.
  No local data store survives.
- **68 — `CheckoutView` is the checkout row plus `missing`.** Nothing else.
  Every deleted field re-read `missing` or was a scalar join, and `missing`
  follows the chosen fulfillment category.
- **74 — There is no separate payouts table.** *"We don't WANT A SEPARATE
  PAYOUTS AND PAYMENTS TABLE."* `payments.details` plus `orders.transactions`
  is the table; `payouts` was an exchange-era name and it is gone.

## Domain boundaries and layering

- **24 — Pricing is one service, and only it prices.** *"nowhere else should
  call pricing except for that one service."* Superseded in shape by 75.
- **26 — A resource owns its own controller and routes.** *"We don't want
  bloated controllers."* Corrected by 26b and 26c.
- **26b — "Orchestrates" is not an exemption.** *"Methods needs an orchestrator
  too."* Every resource folder gets the full stack, so another feature reaches
  it directly, never through the parent.
- **26c — The pattern, stated once for every resource.** *"that should hit the
  order/items orchestrator (controller) and call the domain logic (service),
  not the orders ones."* The parent's routes shrink to mounting. Superseded in
  part by 46, then by 77 and 84.
- **29 — Necessary legacy is grouped; unnecessary legacy is deleted.** *"Move
  all legacy code to a folder called 'legacy' that is a sibling to
  'features'."* Spent — `api/legacy/` is deleted.
- **46 — Five verbs, one file per use case, no spreading.**  `db/` is one
  folder per table with five verbs; `domain/` is one folder per workflow;
  `http/` parses, calls one use case, and sends. Supersedes the parts of 26b,
  26c and 31 that put a stack everywhere.
- **53 — How a use case reads.**  Load rows at the top, one call per row, no
  helper indirection. Amended — *"I don't like drilling 4 layers"* — so one
  `#db` barrel exports a flat module per table.
- **66 — SQL copies, TypeScript decides.** *"I also hate all those returns."*
  Placement is `INSERT … SELECT`. Row-literal mapping functions die; `rules.ts`
  keeps only decisions.
- **67 — Orders knows nothing about carriers.** *"I don't understand why any
  carrier or shipping stuff is living in orders."* Placement commits the order
  and a shipment shell, then calls `shipping.buyLabel` after.
- **69 — Fulfillments owns the handover.** *"Checkout/Orders shouldn't care
  about what's going on over in fulfillment world."* The handover columns move
  to the draft fulfillment's own detail rows.
- **70 — Everything stays in its own lane.** *"The only thing that should be
  deciding if fulfillments is 'ready' is fulfillments."* Each domain owns its
  vocabulary and readiness. Others ask, and never read its columns.
- **71 — No composers; a view is one SQL read.** *"This type of return just
  pisses me off."* Each composed read is one `.sql` file nesting children with
  `jsonb`, parsed by its contract. Decisions are added once.
- **75 — One pricing domain.** *"I just want a centralized domain the rest of
  our app could call to get pricing stuff. Not a billion functions."* Nothing
  outside `pricing` sums money. Supersedes 24's target shape.
- **77 — Organise feature code by domain, not by schema.** *"while the DB
  should be by schema, I don't think our feature code should be. Let's also
  reunify transport/domain under one folder again."* URLs do not move.
- **78 — No dictionaries.** *"that calculateSalesOrder dictionary thing is
  tragic. We shouldn't be doing anything like that ever."* No result
  dictionaries, no return-shape or parameter spreading. Rewrite from the logic.
- **84 — Application code lives under `api/src/`.** The domains are catalog,
  checkout, crm, accounts, logistics, orders, transactions, pricing and
  documents. `db/` keeps the Postgres names; URLs do not move. Refines 77.
  The domain list is superseded in part: `refining` (98) and `inventory` (113)
  make eleven.

## Types and contracts

- **37 — Input shapes belong in the contracts too.** *"Inputs like this should
  be part of shared contracts, so they only have to be updated in one place."*
- **38 — A type does not live wherever it was first needed.** *"if we have
  types randomly living in files, then we have failed."* Used in more than one
  file, it belongs in `@dorado/contracts`. Used in one, it is not exported.
- **57 — A write takes ids plus the patch.** *"All resources come from server
  unless THEY HAVE to come from client. And all types that are going between
  the api and server LIVE IN A CONTRACT."* A builder's options are the Patch
  type, never a local one.
- **60 — Contract names are flat and singular.** *"It should be Rate. That's
  it."* No namespaces. Collisions resolve by natural concept name, never by a
  schema prefix.
- **61 — There is no `New<Entity>` type.** *"For new, it can just send the
  patch!!"* Create and update both take the Patch. The column's `NOT NULL` and
  defaults decide what a create needs.
- **64 — No hand-listed column arrays in code.** *"Why do we have to reference
  arrays of columns so much? That shouldn't be a thing."* A whitelist derives
  from a contract schema; row ownership is a composite foreign key.
- **73 — Function parameters are named contract types.** *"We need to be able
  to pass in exact types to functions."* Rows, patches, views, ids and
  primitives — never an inline structural object type.

## Errors and transactions

- **52 — One catch.** *"have a single function for doing try/catch and passing
  the error along."* No try/catch and no logger call in a domain or transport
  file. `withTransaction` rolls back and rethrows; the handler logs once;
  after-commit side effects run in `attempt(what, fn)`.
- **56 — No conditional `withTransaction`.** The `executor ? write(executor) :
  withTransaction(write)` idiom is banned. A write function takes a required
  `tx` and takes the row as one typed object; only a use case opens a
  transaction.
- **65 — No `throw` in a use case.** *"I'm still seeing error throws… makes it
  kinda hard to read."* Refusals live only in `rules.ts`, as one-line asserts.
  Repo writes use `RETURNING *`.

## Frontend

- **4 — Admin order drawers are interim UI.** The future is one page showing
  all statuses at once. Do not invest in stage-conditional admin display.
- **5 — Lift shared components as surfaces are touched.** Structure now,
  styling later.
- **14 — Container and presentational.**  A parent holds the state and injects
  it as props; the child takes no hooks and fetches nothing, and sits one hop
  away, never five.
- **16 — Delete, do not neuter.** *"They should be deleted and updated in
  call-sites."* Glass, gradients, animations and shadow pairs go with their
  call sites, in the same pass.
- **17 — Every semantic tag gets styling.** *"All semantic html tags should
  have styling… We're going for uniformity."* Where a tag is not prose, scope
  the reset by context, never by a utility at the call site.
- **18 — Unlayered CSS dies with its classes.** *"Needs to be removed from the
  app and call sites."* Unlayered rules beat every layer, so deleting one makes
  a neighbouring utility live for the first time.
- **19 — The visual target is Linear.app.**  Near-black ground, hairline
  borders, no card fills and no shadows. Colour is nearly absent, the brand
  gold excepted. Body copy defaults to muted.
- **20 — Layout at the call site, appearance in the component.** *"the only
  tailwind that should REALLY live in consuming components is layout like
  flex/grid padding/margins etc."* A variant contradicted by a className is a
  defect.
- **21 — Foundation first, then a programmatic sweep.** *"you need to finish
  the foundation in theme.css and typography.css FIRST."* Then shared component
  variants, then the sweep. An inline pattern seen three times is a missing
  component.
- **22 — A span is not a text element.** *"Spans aren't really semantic for
  text."* Replace a text leaf with `<p>` or a heading. A span holds phrasing
  content only, so it may not contain a block.
- **23 — One place to update typography.** *"have only one place to update."*
  The target for type utilities in feature and app code is zero.
- **25 — A button is two axes, not fused names.**  `variant` is primary,
  secondary or tertiary; `intent` is neutral, brand, success, danger, warning
  or info. Hover escalates one step.
- **27 — The shadows die; they do not get tokenised.** *"We no longer want
  those crazy ass shadows."* A shadow is replaced by a border or by nothing.
- **28 — One input, no variants.** *"We only want one input."* One appearance:
  a subtle surface with a hairline.
- **30 — One radio group, not a radio card.**  *"we don't need a radio card, we
  need a radio group component."* Children pass through for custom options; the
  call sites get small.
- **35 — Shared primitives may carry both.** Raw Tailwind sizes and semantic
  scale tokens are both acceptable inside a `shared/ui` component. The scatter
  lint excludes it.
- **44 — The frontend informs nothing.** *"Don't let the frontend inform our
  decision making on the api AT ALL."* Amended once — *"I would prefer to fix
  up the frontend at the same time"* — then reinstated: make the API right
  first and fix the frontend after.
- **55 — The frontend is being deleted.** *"frontend tests can fail and it
  doesn't matter."* Lanes touch API, contracts and `@dorado/client` only, and
  the gate drops the frontend members. `@dorado/contracts` stays the seam.
  Partly overtaken: 83 rebuilt the frontend and 91 starts its overhaul; 99
  then nuked it to auth. The gate still runs no frontend member.
- **62 — `@dorado/client` owns queries and mutations.**  One module per
  resource with hooks, keys and the fetch wrapper, typed only from
  `@dorado/contracts`. The app keeps UI.
- **83 — The Next.js factor.** Business logic leaves the browser for the API;
  every route gets `error.tsx` and `loading.tsx`; `features/` goes and code
  moves under `_src_`. Stores hold UI state, never server data. The same ruling
  parks lots as a write-up. Superseded in part: 98 builds the lots, and 99
  deletes the rebuilt surfaces.

## Process

- **31 — Tests are grouped under `tests/` per feature.** *"all tests need to be
  colocated to features… but grouped under a tests/ folder."*
- **32 — Dead tests go.** *"do we need all those old tests?"* Does it pin
  behaviour that still runs, or is it an oracle for dead code?
- **33 — Tests are TypeScript.** *"why are all the tests written in js"* A JS
  test file is invisible to `tsc`. Convert with the factoring, so each file
  moves once.
- **39 — Purview widened to "fix what is not best practice".** *"if you see
  things that are NOT best practice… feel free to change them."* It does not
  touch the covenant, production, `purge_cancelled`, or a secret's value. The
  obligation is the record.
- **39 (second) — Frontend type sprawl gets its own wave.** *"We shouldn't have
  types (except for like, reasonable things i.e a client only onClick handler)
  living in feature code."* Later work cites "ruling 39" for the purview grant,
  not for this.
- **45 — Continue the migration; do not restart.** *"we don't need to restart.
  We can continue with the migration just updated with this idea in mind."*
  `exchange` is untouched throughout.
- **54 — Almost no comments.** *"don't add any comments unless it's fucking
  crucial and they're VERY short."* No narrative headers, ruling citations or
  history in code. Explanation lives in the docs.
- **86 — A major docs pass.** Rewrite the project documentation to the current
  truth and delete the docs no longer needed. The lots build waits for the
  frontend designs. That half is superseded by 98: build the lots now, API only.

## Auth, money and comms

- **15 — Email is manual.** *"all emails will be sent manually except for auth
  ones and order creation."* Exactly two automatic sends. Recording a send is
  not sending it.
- **47 — Credit is not a choice.** *"No reason to let them make a choice."* A
  sale applies the balance whenever one exists. `using_funds` is dead at every
  layer, and no column records a choice.
- **85 — Admins create sales orders but never pay them.** *"We'll require the
  user to come pay for sales after an admin places it, probably a 1 hour
  window. In general we don't want admins placing sales orders."*
- **87 — Collect sales tax only where nexus is reached.** A line is taxed only
  where `reached_nexus` is true. Volume and count are tracked in every state,
  so the threshold is detectable.
- **88 — Credit is reserved at placement and returned on expiry or cancel.**
  The reservation is a ledger row tied to the order, released by cancel and by
  the abandoned sweep. Pairs with 85.
- **89 — A hold-at-location destination is a row.** `HOLD_AT_LOCATION` on
  return labels is intended, but the destination is a default location row on
  `places.locations`, never a hardcode.
- **90 — The session cache stays five minutes; a ban bites at once.**  A ban, a
  revocation or a role change bites at once, through one indexed read per
  authenticated request.

## Not yet built: 91 to 96

These six govern work that has not started. They were recorded on 2026-09-07
and no wave has executed one.

- **91 — Auth is passwordless and phone-first.** *"We're getting rid of
  passwords."* Sign-in offers phone or email; changing one factor is verified
  through the other, with no choice; step-up only for a stale session; the old
  value is notified after a change; responses are enumeration-safe. The screens
  are the Figma "Auth" file, and the frontend overhaul starts there.
- **92 — An inbound SMS webhook.** *"I want a webhook that can receive messages
  from the phone provider. Just a nice API for it."* Amended: **no Twilio
  Verify** — *"just send them a text"* — so better-auth makes every code and one
  business number carries OTP, two-way SMS and calls. SMS-pumping defence is
  ours: US only, rate limits, captcha, lockout.
- **93 — Dial over the API, with a softphone.** *"We're also gonna want to be
  able to dial over api."* Amended: softphone from the start, no Google Voice
  and no business cell. The browser places the leg and Twilio dials the customer
  from the business number; an inbound call rings every admin with the app open,
  else records voicemail and emails the employee on duty. Refined by 107.
- **94 — Cloudflare in front, against bots.** The client IP comes from
  `CF-Connecting-IP` only when `TRUST_CLOUDFLARE` is set; captcha sits behind a
  provider interface; webhook paths are allowlisted out of the bot rules; edge
  rate limits complement the API's own, never replace them.
- **95 — Mailers come from Figma.** The Figma "Media" file's Mailers page holds
  the header, footer, code, row and card components and every mailer. PDFs
  restyle to the same system.
- **96 — No frontend component without a Figma design Jacob approved.**
  *"Don't build a frontend component for the call panel. If you think we need
  one, needs to be done in figma first with my approval."*

## 97 to 126

These thirty were recorded between 2026-09-08 and 2026-09-22. The source after
each entry is where its text was recovered from; "memory" is the session memory
file named at the top of this file.

- **97 — The payment rails.** Stripe takes cards; Moov moves ACH and RTP in
  and out and vaults counterparty bank details, so a refiner's bank numbers
  never reach our database; Plaid Link feeds Moov and watches Truist for
  matching; wires stay manual. A payout runs `Not sent -> Processing -> Sent`, a
  charge `Due -> Processing -> Received`, and every provider sits behind an
  interface with a fake. 2026-09-08. Source: memory; `docs/waves/payment-rails.md`.
- **98 — Build the lots now, API only.** *"do the lots/refiner stuff. Where
  order items are lots and can map to refiner orders. Where any given customer
  order can send lots to multiple refiner orders."* The Figma Orders and
  Inventory files are guidance, not final. 2026-09-08. Superseded in shape by
  120 and 121. Source: `docs/waves/lots-build.md`; memory.
- **99 — Nuke the frontend except auth.** *"fuck it, yeah go for it. might as
  well remove associated tanstack while ur at it."* Each surface is rebuilt
  against the API as it is, one at a time; TanStack Query stays inside
  `@dorado/client`. 2026-09-08. Source: `docs/waves/frontend-nuke.md`; memory.
- **100 — Build the admin order screens from Figma Orders, with all their
  states.** *"lets try our hand at building the admin orders screen with all
  it's states and such."* Dashboard, lots and customer pages come later.
  2026-09-08. Source: `docs/waves/admin-orders-screen.md`; memory.
- **101 — Refresh the component library from Figma.** *"might need to refresh
  the component library from figma as well."* The "Themes and Components" file
  is the source and the code follows it. 2026-09-08. Source:
  `docs/waves/library-refresh.md`; memory.
- **102 — The app layout from Figma, responsive design and typography.** *"I
  want responsive design and typography, just remember that part."* A `Text`
  component and a `useBreakpoint` hook carry the responsive type steps.
  2026-09-11. Source: `docs/waves/app-shell.md`; memory.
- **103 — The typography and breakpoint decision is the agent's.** *"You make
  the decision, you know better than me bro."* Breakpoints go into Figma as
  variables and Typography gets a Mobile mode; the value goes into Figma first,
  then code, and agents may edit the library for this. 2026-09-11. Source:
  `docs/waves/responsive-type.md`; memory.
- **104 — Resend is the email provider.** *"lets do resend, tbh"* — it
  overrode Postmark minutes after it was picked. Behind the existing email
  interface, with a delivery-status webhook and the fake kept. 2026-09-11.
  Source: `docs/waves/resend.md`; memory.
- **105 — Fakes for now.** *"we'll worry about all the provider keys later once
  we have everything working. Fakes for now."* Every provider runs on its
  recording fake, and every new provider ships fake first. 2026-09-11. Source:
  memory; `docs/design/communications-plan.md`.
- **106 — Providers are named for the business.** *"Lets just name them the
  actual businesses."* The PDF renderer is not a provider and moves into
  documents. The category grouping it began with was reversed the same day:
  providers sit flat, with no category folder until several businesses share
  one. 2026-09-11. Source: `docs/waves/providers-by-business.md`; memory.
- **107 — Port the Google Voice numbers into Twilio.** The customer-facing
  number first, the menu line later as TwiML. Employees call out through a
  dial-out bridge from allowlisted cells, and inbound texts and voicemail
  forward to the on-duty cells and email with a reply bridge. 2026-09-11.
  Source: memory; `docs/design/communications-plan.md`.
- **108 — Every existing customer gets a sign-in number.** *"address phone
  numbers should be sent to user phone numbers... it should be largely 1 to
  1."* A migration fills `auth.users.phone_number` from the address book,
  unverified until the first sign-in; sign-in returns to the previous page; the
  seeded admin phone comes from `SEED_ADMIN_PHONE`. 2026-09-11. Source:
  `docs/waves/phones-backfill.md`; memory.
- **109 — No explanatory comments in the frontend or the components
  either.** Extends 54 to `frontend/` and `packages/components`: a Figma
  reference belongs in the lane doc, not the source. 2026-09-11. Source:
  memory; `docs/waves/leads-api.md` ("ruling 54/109").
- **110 — Documents and mailers wear the design system.** *"is there no way to
  use our themes/components in the mailers/pdfs?"* Both read
  `packages/theme`, and the hand-copied documents theme goes. 2026-09-11.
  Source: `docs/waves/documents-on-the-theme.md`; memory.
- **111 — The inventory model.** A lot has one derived position; inventory is
  on-hand lots plus the pool; refiner orders are optionally many-to-many; a
  sale is filled from a source per line. 2026-09-11. Its payout-timing policy
  setting is superseded by 112. Source: memory; `docs/design/inventory-model.md`.
- **112 — Statuses are decorative; the database stores facts.** *"Statuses
  are great for look and feel, but they're not driving logic."* Facts are
  timestamps and rows, a label is a SQL `CASE`, and the frontend never computes
  state. Amended the same day: a refusal is `blocked` (a data error),
  `override` (serious money: fresh step-up plus a stored reason) or `confirm`
  (business judgment, allowed with a reason). 2026-09-12. Source:
  `docs/waves/facts-and-positions.md`; migration 182; memory.
- **113 — An `inventory` domain owns the lot.** Position, split, combine, the
  lot view and its summary; orders keeps the order and pricing prices.
  2026-09-12. As first stated, batches and the pool stayed with `refining`;
  120 and 121 moved the pool to `inventory.pool`, so the law as built is:
  `inventory` owns the lot, the lineage and the pool, `refining` owns the
  refiner order, the batch and the settlement (`CLAUDE.md`). Source:
  `docs/waves/facts-and-positions.md`; memory.
- **114 — The API is designed to best practice.** *"I just want the nicest
  structured, easily readable, best practice API... You're gonna know what to
  do."* PATCH for an edit with no side effect; a POST action only for a side
  effect or a multi-table write. 2026-09-12. Source: memory;
  `docs/waves/write-fold.md`.
- **115 — A provider's external routes live in its `constants.ts`.**
  *"anything with provider external routes should live in constants.ts (the
  colocated one)."* Every external URL, base and path sits in
  `providers/<provider>/constants.ts`, never inline. 2026-09-12. Source: memory.
- **116 — Business facts are rows, not constants.** Keep-in-mind, not work:
  the CRM may one day serve other dealers, so a business fact is a row, one
  resolver answers "the organization", and providers take config at
  construction — but no tenant plumbing now. *"Do NOT think about that as
  something that needs to happen atm."* 2026-09-12. Source: memory; migrations
  232-264.
- **117 — No mark-received button.** *"I don't think we'll ever need this mark
  received button."* Arrival is the inbound fulfillment's done state, with no
  `received_at` column; lot positions are derived and never shown as badges on
  an order's Lots rows. 2026-09-12. Source: memory;
  `docs/design/api-gaps-orders.md`; migrations 184-185.
- **118 — On a refiner sale order, one `Settlement` card replaces Lots.** It
  carries the refiner's figures beside ours. *"Refiners might combine some
  lots without us telling them"*, so a combine is allowed at the refiner and
  settled content allocates back pro rata. 2026-09-12. Source: memory.
  `docs/design/inventory-tab.md` cites 117 and 118 for sparse badges, which
  memory records as 117 and 119.
- **119 — Badges are sparse.** *"Stop with the badges, they should be used
  sparsely."* A badge sits only in a card title row or beside a header
  eyebrow, never per row and never as a category label. A design brief starts
  from Jacob's screen. 2026-09-12. Source: memory;
  `docs/design/api-gaps-orders.md`.
- **120 — The lot model.** *"all makes sense."* A refiner order's lines link
  to our lots through one link table; the customer is always paid on our
  figures, which an explicit `Adopt refiner assay` copies in; a refiner melt
  combines on our side too by default. Price is derived, never stored.
  2026-09-12. Source: `docs/waves/lot-model.md`; memory.
- **121 — The lot model's schema.** *"3rd normal form man"* — values in one
  place, links in another. One `inventory.lots`, one lineage table
  `inventory.lot_sources`, and `orders.lots` and `refining.lots` as pure links.
  2026-09-12. The first draft gave the lot a `kind` column and three edge
  kinds; as built there is no kind column (a lot on `refining.lots` is a
  refiner lot, and inventory never counts one) and the lineage kinds are
  `split`, `combine`, `batch` and `sale`, the last for a lot minted from stock
  to sell. The built form is the law (`docs/waves/lot-model.md`, `CLAUDE.md`).
  Source: `docs/waves/lot-model.md`; memory.
- **122 — No radio icons on admin screens.** A single choice is radio chips or
  a Select; two filters are two chip rows, each single-select. 2026-09-13.
  Source: memory; `docs/design/api-gaps-pricing.md`.
- **123 — Order profit and the pool.** *"I suppose that makes sense."* Order
  profit is what we paid the customer against assayed fine oz at the assay-day
  spot, fixed on that day; a pool withdrawal realises
  `oz x (withdrawal spot - assay-day spot)`, never attributed to an order.
  2026-09-13. "No averages, no FIFO" governs order profit: an order's lots are
  valued at their own assay-day spot, never averaged across orders. A pool
  lock's credit-spot basis is a weighted average of the ounces it draws, which
  is the pool's own figure and attributes nothing back to an order
  (`docs/waves/pool-spot.md`). Source: memory; `docs/waves/pool-spot.md`.
- **124 — The Admin Header is for list pages only.** *"Individual pages do not
  use admin header!!"* An order, lot, customer, lead or refiner order keeps the
  site Header and a breadcrumb. 2026-09-13. Source: memory;
  `docs/design/inventory-tab.md`.
- **125 — Four order prefixes, one sequence.** `PO-` customer purchase, `SO-`
  customer sale, `RP-` refiner purchase, `RS-` refiner sale; customer numbers
  are unchanged. 2026-09-13. Source: memory; `docs/design/api-gaps-orders.md`.
- **126 — SMS consent is recorded, never enforced.** *"Once we're
  bigger/have scaled we'll start enforcing it."* No refusal on texting without
  consent; an `Ask for consent` text, the sign-up checkbox and an admin verbal
  stamp record it. 2026-09-22. Source: memory;
  `docs/design/people-comments-2026-10-07.md`. `docs/waves/sms-consent.md`
  files the same decision under 112.

## 127 and on (2026-10-14)

- **127 — An audit fact stores the actor's id, never the actor's name.**
  *"What if a user changes their name? All audit fields that need names should
  use ids instead."* A history, event or stamp column holds `actor_id`
  (`created_by_id`, `updated_by_id`); no `actor_name`, `created_by` or
  `updated_by` text sits beside it, and no trigger writes one. A read returns
  the id; the frontend resolves names through one batched user-name lookup
  per screen, cached by the query client, so a renamed user reads correctly
  everywhere at once. The three history tables that stored names
  (`rates.rate_history`, `spots.adjustment_history`, `spots.source_events`)
  drop the column; the genesis-era `created_by`/`updated_by` text columns are
  swept in a later lane after `audit:coverage` shows nothing reads them.
  2026-10-14. Source: Jacob, in session; audit-ids lane.
- **128 — Every record list is the Table component, driven by TanStack
  Table.** *"These should probably be using our table component. Think all
  our tables should be. And then custom rows for the mobile cards as rows."*
  A ledger, log, history or lock list renders through `@dorado/components`
  Table primitives with `@tanstack/react-table` holding the column model,
  sorting and pagination state (server-driven where the API pages); no
  hand-rolled grid of list items. On mobile the same column model renders
  each row as a card row, the way the Library's mobile row variants draw it,
  so one definition serves both layouts. 2026-10-14. Source: Jacob, in
  session; pricing-frontend lane.
- **129 — Times read 12-hour with AM/PM, everywhere.** *"All dates AM/PM
  please."* A timestamp on a screen, in an email, on a PDF or on a Figma
  frame reads `Apr 8, 4:07 PM` (the year only when it is not the current
  one), in the business's time zone; never `16:07`. One formatter in
  `frontend/shared/utils` serves every screen, and the documents renderer
  uses the same shape. 2026-10-14. Source: Jacob, in session.
- **130 — A ported surface ships with its Playwright specs.** *"You're
  building e2e tests as we're porting, right?"* Every screen a lane ports
  lands with `*.e2e.ts` specs beside its route that drive a real browser
  against the live API with the e2e seed: the screen renders its frame's
  facts, each action the frame draws does what the API says, and the
  mobile layout is exercised at 390. Unit tests and screenshot compares do
  not substitute. 2026-10-14. Source: Jacob, in session.

- **131 — A sales order locks its spots at placement.** *"Yes, should lock on
  sales order placement. We'll cancel orders that don't pay in time."*
  Placement records the lock events beside the freeze; migration 283 gave
  every placed sale its opening events. Customers cannot place sales orders
  for now. 2026-10-14. Source: Jacob, orders port review decision 1.
- **132 — One payout method by default; a split is an explicit add.** *"By
  default it should only have one with no input."* A payout has one method
  and no amount field; "Add payout method" opens a second (credit, then the
  rest by eCheck, for example) and only then each method carries an amount.
  2026-10-14. Source: decision 5.
- **133 — A sale is cancelled only when nothing has been sent.** *"As long
  as the money hasn't been sent. If it has, refund first."* Admin cancel of a
  sale releases the credit reservation and voids the label; a sale with a
  received charge is refunded first, then cancelled. 2026-10-14. Source:
  decision 6.
- **134 — What closes an order.** *"Customer purchase orders close when the
  customer receives their payout. Customer sales orders close when we have
  payment and they've received their items."* Refiner settlement on a
  purchase is for the profit breakdown only and never gates completion.
  2026-10-14. Source: decision 9.
- **135 — A pooled refiner sale shows ounces and dollars; the refiner fee
  belongs to the refiner order.** *"Just show both. Why would we need refiner
  fees in pool?"* Nothing is attributed to the pool. 2026-10-14. Source:
  decision 10.
- **136 — Documents supersede, never delete.** *"Supersede. We know the exact
  documents that will pertain to each one."* Each order kind has a fixed
  document set; regenerating keeps the earlier rows. 2026-10-14. Source:
  decision 12.
- **137 — Photos are many to one with a lot**, and lead quote items carry
  them too. 2026-10-14. Source: decision 13.
- **138 — Mobile and state frames are designed before a port, as component
  states.** *"Designed before the port; most of those should be living in
  components."* 2026-10-14. Source: decision 18.
- **139 — The order screen's Chat is the customer's thread**, the same one
  the Inbox shows, so nobody goes back and forth. 2026-10-14. Source:
  decision 19.

- **140 — The word "melt" never appears**, for legal reasons. Quote
  Estimate scrap rows keep their names ("14K Gold") and read "{g} gross weight · {n}% purity"; no ounces, no per-ounce price;
  bullion rows "{n} units · {oz} oz · ${x} each". The Invoice's "post melt"
  and the manifests' "pre melt" change to a term Jacob names (asked on the
  Media file); the renderer strings follow that answer. 2026-10-15. Source:
  Jacob, Media file comment.

- **141 — The order list ports the proposed card with the state badge**
  (673:20375, card 671:28586), not the base list's two-badge card.
  2026-10-15. Source: Jacob, decision 2.
- **142 — The order header always shows the state badge.** *"Yes state
  badges there please."* The four base screens gain one. 2026-10-15.
  Source: decision 3.
- **143 — The state "Awaiting Payout" is renamed "Awaiting Finalize"**,
  since it means priced but not finalized; and the state filter row gains a
  Cancelled chip. 2026-10-15. Source: decisions 4a and 4b.
- **144 — A lot is never deleted; it is combined or unlinked.** *"We
  shouldn't be able to delete lots that we need... if it's a lot in a
  purchase order that just arrived, we should be able to combine lots."* A
  lot on hand in inventory or on a refiner order cannot be removed from its
  order. On a purchase whose lots have not moved on, "remove" is a combine
  (lineage `combine`, the sources consumed) or an unlink that keeps the row;
  both leave an audit trail. 2026-10-15. Source: decision 7.
- **145 — A return is part of cancel, and only when goods have moved.**
  Cancelling an order whose label was never scanned needs no return;
  cancelling after the parcel arrived creates the return leg. A customer who
  keeps half and returns half gets a new order, not a partial return.
  2026-10-15. Source: decision 8.
- **146 — A refiner order stays open until every lot has settled.**
  *"Most likely they will all be settled at the same time."* Settling stamps
  the order only when no lot is left unsettled. 2026-10-15. Source:
  decision 9b.

## Numbering

Every number from 1 to 146 has an entry, plus 26b and 26c. Two rulings carry the
number 39; both are listed. No number is ever reused.
