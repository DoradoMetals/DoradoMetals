# Cassettes

Recorded provider responses - the replay half of lane 5
(`docs/waves/test-suite-redesign.md` 2.4b). `nock.back` writes one file per
scenario against the real Stripe test mode account and the real FedEx sandbox;
`shared/testing/cassettes.ts` (`withCassette`) plays them back in every default
test lane, and refuses loudly if a cassette is missing rather than reaching
the network. `pnpm --filter @dorado/api test:record` regenerates the RECORDED
files from the same two provider test files - it skips the two synthetic ones
(see below).

## Layout

```
tests/cassettes/
  stripe/
    create-intent-idempotent.json    same idempotency key, twice
    create-payment-intent.json       createCustomer + createIntent (D25 metadata)
    update-intent-amount.json        create, update the amount, retrieve
    cancel-intent.json               create then cancel
    cancel-unknown-intent.json       cancelling an id Stripe never issued
    retrieve-unknown-intent.json     retrieving an id Stripe never issued
    cancel-intent-transient-error.json   SYNTHETIC - an intent Stripe reports
                                         as `processing`, which cancel refuses
    self-heal-stale-intent.json          SYNTHETIC - an already-canceled intent
                                         under a fixed id
  fedex/
    rate-quote.json                  a priced rate quote
    address-validation.json          address resolve
    pickup-availability.json         pickup availability
    tracking.json                    tracking on FedEx's own sandbox number
    create-and-void-label.json       a label bought, then voided in the same run
```

Six recorded Stripe scenarios plus two synthetic ones, and five FedEx. The
webhook signature verification test
(`providers/payment/tests/stripe-cassettes.test.ts`) needs no cassette -
`constructEvent` is signature arithmetic over a payload and a secret, not a
network call.

The six recorded Stripe files were re-recorded on **2026-09-06** against
stripe-node 22.6.1 / API version `2026-08-26.dahlia` (`docs/waves/stripe-22.md`).
The four majors changed no REQUEST body this repo sends; the only new response
field is `payment_record` on `PaymentIntent`.

## The two synthetic cassettes are NOT recorded, and recording must not touch them

`cancel-intent-transient-error.json` and `self-heal-stale-intent.json` are
hand-written. They describe states the sandbox will not produce on demand - an
intent stuck in `processing`, and an intent already canceled under a fixed id -
and the assertions that read them (`/status of processing/i`; the self-heal
path) exist precisely because those states are unreachable live.

`nock.back`'s `update` mode DELETES a fixture and re-records it from whatever
the sandbox says now. Aimed at these two it replaces the state under test with a
plain `resource_missing` 404, the assertion goes red, and the fixture is gone.
That happened during the Stripe 22 pass and one file was restored by hand. So
`shared/testing/cassettes.ts` carries a `SYNTHETIC` set and drops to `lockdown`
for those names even inside a recording run: they REPLAY in every lane,
`test:record` included. Add a hand-written cassette, add it to that set.

## Answering Jacob's open question: yes, these are committed

The design doc's inclination was right, and this directory is the evidence:
every value that could identify a real person, a real account, or a real
credential is replaced before a cassette ever reaches disk (see Scrubbing
below), and what remains - amounts, statuses, service names, tracking numbers
generated for a synthetic sandbox shipment - is not customer data. It never
was: every request is built from constants the test file itself writes
(`CUSTOMER_ADDRESS`/`STORE_ADDRESS` are a public university and a public
convention centre; `Cassette Suite` / `cassette@example.invalid` are literal
strings in the test source, not a lookup against any real row). Committing
buys what the design doc said it would: a provider shape change shows up as a
diff, the suite runs deterministic and offline, and a reviewer can read
exactly what Stripe and FedEx said without holding sandbox credentials.

The content-encoding step matters as much as the scrub: axios asks FedEx for
gzip, and an unscrubbed, undecoded cassette is a wall of hex chunks nobody can
diff. `shared/testing/cassettes.ts`'s `scrub()` decodes every response body to
plain JSON before scrubbing it, which is what makes "committed because it is
scrubbed" a claim a reviewer can check by opening the file, not one they have
to take on trust.

## Scrubbing rules

Applied in `shared/testing/cassettes.ts` before a cassette is written, and
symmetrically to every live request before it is matched against one (so a
scrub is never a reason a replay stops matching):

| what | replaced with | why |
|---|---|---|
| `Authorization` / bearer headers | never recorded at all (`enable_reqheaders_recording: false`) | the FedEx access token and the Stripe `sk_test_...` key are request headers - the cheapest scrub is not capturing them |
| FedEx `accountNumber` / `associatedAccountNumber` (request) | `SCRUBBED_ACCOUNT_NUMBER` | matched **by key**, not by comparing against the live env value - a scrub keyed to `FEDEX_SANDBOX_ACCOUNT_NUMBER` being set would silently do nothing on a machine where it isn't |
| FedEx OAuth body (`/oauth/token`) | a fixed literal string | the body carries `client_id`/`client_secret` in the clear; the whole body collapses rather than being parsed and re-scrubbed |
| FedEx date-stamp fields (`shipDateStamp`, `packageReadyTime`, `readyDateTimestamp`, `customerCloseTime`, `scheduledDate`) | `SCRUBBED_DATE` | these are the day the recording ran, not the day a replay runs - keeping them real would make every cassette a ticking clock |
| Stripe request body `customer`, `metadata[user_id]`, `metadata[session_id]` | fixed placeholders | properties of which fixture row the test happened to run against, not of what the code sends. The **keys** stay pinned - a payload that stopped sending `metadata[user_id]` still fails to match |
| Stripe/FedEx `access_token` / `refresh_token` | `SCRUBBED_ACCESS_TOKEN` | bearer tokens in a JSON response body |
| Stripe customer `name`, `email`, `description`; `billing_details`/`shipping` `name` | `SCRUBBED NAME` / `scrubbed@example.invalid` | matched by object shape (`object === "customer"` etc.), not by key alone - `name` also means a FedEx service name, which must not be touched |
| FedEx `personName`, `phoneNumber`, `emailAddress`, `email` (response) | `SCRUBBED NAME` / `0000000000` / `scrubbed@example.invalid` | matched by key everywhere they appear in a response |
| FedEx `encodedLabel` | a fixed base64 placeholder (`SCRUBBED_LABEL`) | a label PNG is a quarter-megabyte of base64 with two addresses rendered into its pixels, and no assertion reads them - `create-and-void-label.json` only checks the field is present and decodes to non-empty bytes |
| Stripe `client_secret` | prefix kept, suffix replaced with `SCRUBBED_SECRET` | the prefix is the intent id, which several call sites read off the secret; the suffix is the browser's authority to confirm the intent, which is the part worth treating as a credential |
| every other response header (rate-limit counters, request ids, `Set-Cookie`, Stripe's echo of the idempotency key) | dropped entirely, keeping only `content-type` | nothing in this suite asserts on them, so there is nothing to lose by not writing them |

## What could not be scrubbed, and why that's accepted

- **`request_log_url` on the two Stripe error responses** (`cancel-unknown-intent.json`,
  `retrieve-unknown-intent.json`) embeds the Stripe **test-mode** account id
  (`acct_...`) in a dashboard URL. It is not in the scrub map because Stripe
  does not send it under a fixed key shared with anything else worth matching
  by shape, and it carries no customer data - opening it requires
  authenticated access to the account that owns the sandbox credentials in
  `api/.env`, credentials no cassette carries. Left as-is rather than
  special-cased for one field on two files.
- **Object/resource ids** (`cus_...`, `pi_...`, FedEx tracking numbers like
  `794859746626`) are real ids the sandbox issued and are deliberately kept -
  several assertions read their shape (`intent.id.startsWith("pi_")`,
  `client_secret?.startsWith(intent.id)`, a tracking number matching
  `/^\d{12,}$/`), and an id is an opaque token, not personal data. The FedEx
  tracking number in `create-and-void-label.json` names a **sandbox-only**
  shipment that was voided in the same recording run.
- **FedEx's own sandbox host and REST paths** (`apis-sandbox.fedex.com`,
  `/rate/v1/comprehensiverates/quotes`, ...) and Stripe's (`api.stripe.com`,
  `/v1/payment_intents`, ...) are not secrets - they are public API surface,
  needed verbatim for `nock.back` to match a request's scope and path.

Nothing above is a name, an address, an email, a phone number, or a
credential belonging to an actual customer or employee - the standing rule
this repository's `CLAUDE.md` states first ("Never log or return bank
details" / never leak customer data) is satisfied by construction: no
customer-shaped input ever reached these requests to begin with.

## Idempotency and determinism (why a replay matches)

- **Idempotency keys are fixed literals per scenario** (e.g.
  `cassette:create-intent:v1`), never derived from `Date.now()`. Stripe sends
  the key as a request **header**, and headers are never recorded
  (`enable_reqheaders_recording: false`) or matched on, so the key does not
  need to appear in the cassette at all - what it pins is the *behaviour*
  under test (two calls with the same key return the same intent), which is
  asserted directly against the two recorded responses.
- **Stripe test clocks are absent on purpose.** A test clock is a server-side
  object; it has no meaning in a replayed response and belongs to the live
  sandbox lane (`test:external`) only.
- **FedEx's pickup-availability cassette pins `readyDate` to a fixed past
  date** (`2026-01-01T09:00:00Z`, in `fedex-cassettes.test.ts`). The parser
  drops every slot earlier than `readyDate`; a "now" ready date would filter
  the whole recorded answer out of scope as the cassette ages.
- **Body matching is symmetric.** Every normalisation applied when a cassette
  is written (`scrub()`) is applied again to the live request before it is
  compared (`filteringRequestBody`/`applyMatchers`), so a value that changes
  between two runs of the same scenario (a fixture row's uuid, today's date)
  never breaks a match, while every value the test actually asserts on
  (amount, currency, status, metadata keys) still has to agree exactly.

## Regenerating

```
pnpm --filter @dorado/api test:record
```

Requires the real sandbox credentials in `api/.env` (Stripe: `sk_test_...`;
FedEx: the `FEDEX_SANDBOX_*` set) and network access. Deletes and re-records
every RECORDED file in one run - `nock.back`'s `update` mode, not `record`
mode, so a stale cassette can never linger next to a fresh one under the same
name. The two synthetic files are skipped, as above.
