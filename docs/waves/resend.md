# Resend is the transactional email provider (ruling 104, 2026-09-11)

Jacob picked Resend. It sits behind the interface `providers/resend/` already
had (named `providers/emails/` at the time this ruling was made; the SMTP
adapter it sat beside is since deleted and the folder renamed - see
`docs/waves/providers-by-business.md`), so nothing that sends mail changed: a
mailer still calls `documents/emails/service.ts`, which still calls
`deliver()`, which still files a paper-trail row before the failure travels
on.

## Selection

`providers/resend/index.ts` `selected()` answers one of two, in this order:

| condition | provider |
|---|---|
| a test run (`NODE_ENV=test`, or `--test` in `execArgv`) | `fake` |
| `RESEND_API_KEY` is set | `resend` |
| neither | `fake` |

**The SMTP branch is gone.** `nodemailer.ts` and the `EMAIL_HOST` /
`EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` env vars it read are deleted;
without a Resend key the selection is the recording fake, full stop. A test
run never reaches a real provider, and `NODE_ENV=production` on the fake still
refuses to boot.

`resend.ts` `assertSendable()` runs when the shared transport is built, and in
production ONLY: `RESEND_FROM_DOMAIN` must be set, and `EMAIL_FROM` must be an
address on that domain or a subdomain of it. Resend rejects a From on an
unverified domain per send, which would arrive as fourteen failed rows and no
mail; this turns it into one refusal at the first send instead.

## The send

`POST https://api.resend.com/emails`, `Authorization: Bearer $RESEND_API_KEY`,
one message per call. The body is `requestBody(message)`, a pure function so
its shape is a fixture rather than a live call:

```json
{
  "from": "Dorado Metals Exchange <orders@doradometals.com>",
  "to": ["customer@example.com"],
  "subject": "Your order",
  "html": "…",
  "text": "…",
  "attachments": [{ "filename": "packing_list.pdf", "content": "<base64>",
                    "content_type": "application/pdf" }],
  "tags": [{ "name": "kind", "value": "purchase_order_created" }]
}
```

`html`, `text`, `attachments` and `tags` are omitted when empty. The tag is the
mailer KIND, the same label `media.email_kind` carries, so a Resend dashboard
filter and a paper-trail query ask the same question; Resend accepts only
`[A-Za-z0-9_-]` in a tag, so `tagsFor` replaces anything else.

A 2xx answers `{ "id": … }` and that id becomes `media.emails.provider_message_id`
— the transport returns `{ messageId }`, which is the shape `rules.outcomeOf`
already read. A non-2xx, a network failure or a 2xx with no id becomes an
`Error`, which `deliver()` turns into a VALUE, which `recordEmail` files as a
`failed` row carrying the refusal text. Nothing escapes the provider
un-recorded.

`RESEND_HOST` overrides the base URL; it exists so a rehearsal can point
somewhere else and is unset everywhere.

## The webhook

`POST /api/webhooks/resend`, mounted in `app.ts` beside Moov's and Plaid's,
BEFORE `express.json()` with its own `express.raw({ type: 'application/json' })`
— the signature is over the raw bytes, so a re-serialised body would not verify.

**Authentication is Resend's documented Svix signature**, not Basic auth:

- headers `svix-id`, `svix-timestamp`, `svix-signature`
- the secret is `whsec_` + base64; the KEY is that base64 decoded
- signed content is `` `${svix-id}.${svix-timestamp}.${body}` ``
- HMAC-SHA256, base64, compared constant-time against every `v1,<sig>` in the
  space-separated header
- a delivery more than five minutes old is refused, so a captured body cannot be
  replayed forever

`providers/resend/tests/resend-webhook.test.ts` pins a hand-computed signature
fixture, so the implementation is checked against the documented scheme rather
than against itself.

An unsigned or badly signed delivery is **401**. Everything that verifies is
**200 `{ received: true }`**, including an event naming a message the trail does
not hold — refusing it would only make Resend retry it forever.

### What an event does to the row

`media.emails` gained four columns (migration 171): `delivered_at`,
`bounced_at`, `bounce_reason`, `complained_at`.

| event | effect |
|---|---|
| `email.delivered` | `delivered_at` set, **only if `bounced_at` is null** |
| `email.bounced` | `bounced_at` and `bounce_reason` set, first one wins |
| `email.complained` | `complained_at` set, first one wins |
| `email.delivery_delayed`, `email.opened`, `email.sent`, anything else | accepted, recorded nowhere — there is no column |

**`status` is NOT touched.** It means "the provider accepted the send", and
`media/emails/sql/has_sent.sql` keys the once-per-order mailers on it: a bounce
flipping it to `failed` would make an order confirmation eligible to send again.

**Idempotency and ordering are structural, not a processed-events table.** Every
write is `coalesce`-guarded and keyed on the email id, and the row is locked
(`get_by_provider_message_id.sql`, `FOR UPDATE`) before the decision is made -
`applyDeliveryEvent(event, tx)` is the unit of work and `recordDelivery(event)`
the use case that opens the transaction around it (ruling 56). So
the same `svix-id` replayed changes nothing, a bounce arriving after a delivery
is still a bounce — `bounced_at` is set whatever `delivered_at` holds, and the
suppression read keys on it — and a delivery arriving after a bounce is ignored.

## Suppression: marketing only

`rules.suppressible(kind)` is true for `promo` and nothing else. `post()` — the
one function every mailer sends through — asks `emails.isSuppressed(address)`
first for those kinds, and a suppressed address gets no send and no row.

An address is suppressed once ANY email to it has a `bounced_at` or a
`complained_at`.

**Codes and order mail keep going to a bounced address, deliberately.** A
bounced sign-in code is a failure the customer sees and reports; an order the
business cannot confirm is worse than a complaint.

`sendPromo(mail, transport?, executor?)` exists so that rule has a path. Nothing
schedules it — marketing is still later work — and it is the only kind the rule
applies to.

## What Jacob configures

Nothing here is set, and no Resend token exists in any env file. Until `RESEND_API_KEY` is set the API behaves exactly as it did.

1. **`RESEND_API_KEY`** — a Resend API key with send permission. Setting it
   switches the provider; with no key, mail goes to the recording fake outside
   a test run (SMTP support has been removed - there is no third option).
2. **Domain verification.** Add the sending domain in the Resend dashboard and
   publish the DNS records it prints: a DKIM `TXT`, the `MX` and `TXT` for the
   return path (`send.<domain>`), and a DMARC `TXT` if there is not one already.
   Resend will not send from an unverified domain.
3. **`RESEND_FROM_DOMAIN`** — that verified domain, and `EMAIL_FROM` an address
   on it. In production the API refuses to send without both agreeing.
4. **The webhook.** In the Resend dashboard add an endpoint at
   `https://<api host>/api/webhooks/resend` and subscribe it to
   `email.delivered`, `email.bounced` and `email.complained` (`email.opened` and
   `email.delivery_delayed` may be added; they are accepted and ignored). Copy
   the signing secret it shows — it starts `whsec_` — into
   **`RESEND_WEBHOOK_SECRET`**. Without it every delivery is refused 401, which
   is the safe direction.
5. **Message streams.** Resend has no stream concept; the equivalent is one
   API key per sending domain, and marketing mail (if it ever happens) should
   get its own key and its own subdomain so a promo complaint cannot affect the
   reputation the order mail sends on.

Env keys this lane reads: `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`,
`RESEND_WEBHOOK_SECRET`, `RESEND_HOST` (optional), plus the existing
`EMAIL_FROM`.

## Not done here

- **No live send has ever been made.** There is no token in this repo, the
  adapter is written against Resend's documented REST API and webhook payloads,
  and every test drives fixtures or the recording fake.
- The paper trail is not exposed anywhere: there is no admin screen reading
  `delivered_at` / `bounced_at` yet, and no report of suppressed addresses.
- A suppressed address is never released. Un-suppressing is an admin action
  nothing offers.
