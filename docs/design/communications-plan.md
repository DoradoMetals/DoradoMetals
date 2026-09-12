# Communications plan: numbers, texts, calls, notifications

Decided with Jacob on 2026-09-11 (rulings 91-94, 96, 104-107). Twilio is the
carrier for texts and calls, Resend for email, Cloudflare for the edge and the
dev tunnel. Twilio has no inbox app; the app is the inbox and the notifier.

## Numbers

| number | today | plan |
|---|---|---|
| customer-facing line | Google Voice | port into Twilio (unlock at Google Voice, port-in at Twilio: 1-3 weeks, keeps working until cutover). Becomes the app's number: codes, texts, calls, caller ID. Customers never learn a new number. |
| menu / helper line | Google Voice | leave for now; port later and rebuild the menu as TwiML. |
| bought Twilio number | none | buy one now for development, the 10DLC registration and webhooks; release it when the port lands (`TWILIO_FROM_NUMBER` swaps). |

A2P 10DLC: register a Standard brand (EIN) and a low-volume standard campaign
("account notifications / customer care"); one to two weeks; attaches to the
number that sends; outbound texts to customers wait on it. Inbound works at
once. Twilio Verify is NOT used: better-auth mints every code, Twilio only
delivers.

## Texts

- Outbound: sign-in codes and conversational replies from the business number.
- Inbound: `POST /api/sms/inbound` (signature-checked) records every message
  on `crm.sms_messages`, matched to the customer by verified phone; delivery
  status via `POST /api/sms/status`.
- **Forwarding**: every inbound text and voicemail is forwarded to the on-duty
  employees' cells (numbers on `auth.employees`) and to email, so nobody needs
  the website open to know a customer wrote.
- **Reply bridge**: an employee replies from their cell to the forwarded text;
  the API recognises the allowlisted number and relays the reply to the
  customer FROM the business number. The customer sees only the business
  number; the exchange stays on their timeline.

## Calls

- Browser softphone (Twilio Voice SDK): outbound from the admin site, inbound
  rings every admin with the site open, voicemail recorded and emailed when
  nobody answers. No call-panel UI until it is drawn in Figma (ruling 96).
- **Dial-out bridge**: an employee calls the business number from their cell;
  because the cell is allowlisted, the IVR asks for the customer's number and
  connects the call with the business number as caller ID. No app, any phone.
- IVR for the menu line: TwiML/Studio, after that number ports.

## Notifications

1. Now: forwarded texts and voicemail emails (above). Guaranteed path.
2. Later: browser push from the message component. Works with the browser
   closed on Android and desktop Windows; on iPhone only when the admin site is
   added to the Home Screen (then it behaves like an app: badges, alerts). No
   app store app in any case.

## Local development

- Every provider runs on a recording fake without keys (ruling 105); codes
  read back via `GET /api/account/last_code?number=|email=`.
- The Cloudflare tunnel `dev-api.doradometals.com` exists ONLY so providers can
  call the local API (inbound texts, call routing, bounce events). Stop the
  connector service when not testing webhooks: while it runs, the dev API is
  reachable from the internet.
- Bot Fight Mode stays off: it cannot exempt webhook senders on the Free plan;
  path-scoped WAF rules on the code-sending routes are the intended defence.

## Env, when each goes live

Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`; webhook
URLs `/api/sms/inbound`, `/api/sms/status`, `/api/calls/twiml`,
`/api/calls/status` on the tunnel (dev) or the api host (prod).
Resend: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` (bounce webhook
`/api/webhooks/resend`, optional until the delivery facts matter).
Turnstile: `TURNSTILE_SECRET_KEY` (api), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
(frontend), widget mode Managed.
Cloudflare: `TRUST_CLOUDFLARE=1` behind the proxy (production).
