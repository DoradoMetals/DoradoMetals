# A2P 10DLC campaign registration (Twilio)

Answers to paste. Brand: Dorado Metals Exchange LLC (doradometals.com).

## Use case

Low Volume Mixed (sign-in codes, account and order notifications, customer
care replies). No marketing. Legal name Dorado Metals Exchange LLC, operating
as Dorado Metals: the description must say so (DBA rule).

## Campaign description

Dorado Metals Exchange sends transactional and customer-care text messages
to customers who buy and sell precious metals with us: one-time sign-in
codes, order status updates (shipment received, assay complete, payment
sent, tracking), appointment and pickup reminders, and replies to customer
questions sent to our business number. No promotional or marketing content.

## How consumers consent (message flow)

Opt-in methods: Web Form and Verbal consent. Customers opt in on
doradometals.com when creating an account, placing an order, or requesting a
quote (the lead form): they enter their mobile number and check an unchecked-by-default box
reading "I agree to receive text messages from Dorado Metals about my
account and orders. Message and data rates may apply. Message frequency
varies. Reply STOP to cancel, HELP for help." The consent and its timestamp
are stored on the account. Customers who text our business number first are
replied to on that conversation only. Privacy policy:
https://doradometals.com/privacy. Terms: https://doradometals.com/terms.

## Sample messages

1. Dorado Metals: Your sign-in code is 483920. It expires in 10 minutes.
   Reply STOP to opt out.
2. Dorado Metals: We received your shipment for order PO-2481. We will text
   you when the assay is complete. Reply STOP to opt out.
3. Dorado Metals: Your payout of $5,102.40 for order PO-2481 was sent by ACH
   today. Questions? Reply here. Reply STOP to opt out.
4. Dorado Metals: Reminder: your pickup is Wed Sep 10, 1-3 PM, at 1200 Regal
   Row, Dallas TX. Reply STOP to opt out.
5. Dorado Metals: Thanks for reaching out. A team member will reply shortly.
   Reply STOP to opt out.

## Keywords

- Opt-in keyword: START. Reply: "Dorado Metals: You are opted in to account
  and order texts. Message and data rates may apply. Message frequency
  varies. Reply HELP for help, STOP to cancel."
- Opt-out keyword: STOP. Reply: "Dorado Metals: You are unsubscribed and
  will receive no further texts. Reply START to re-subscribe."
- Help keyword: HELP. Reply: "Dorado Metals: For help email
  exchange@doradometals.com or call our business number. Reply STOP to
  cancel."

## Attributes

Subscriber opt-in: yes. Subscriber opt-out: yes. Subscriber help: yes.
Embedded links: yes (full doradometals.com links only, no shorteners).
Embedded phone numbers: yes. Age-gated content: no. Direct lending: no.
Number pool: no.

## Before submitting

- The consent checkbox must exist on the sign-up and checkout screens with
  the exact wording above, and the privacy page must state that mobile
  information is not shared with third parties for marketing. Carriers
  reject campaigns whose opt-in cannot be shown; attach a screenshot of the
  checkbox.
- `docs/design/communications-plan.md` for what the number is used for.

## Verbal consent script (phone leads)

"Can we text you at this number about your quote and your order with Dorado
Metals? Message frequency varies, message and data rates may apply, reply STOP
at any time to opt out or HELP for help. Our terms and privacy policy are at
doradometals.com/terms and /privacy. Is that a yes?" On a yes the lead record
stores the consent (method verbal, timestamp) and the customer receives the
opt-in confirmation text. A lead with neither web nor verbal consent gets a
call, never a first text.

## Form field answers (paste order)

Use cases: Low Volume Mixed. Campaign description: the paragraph above with
the DBA sentence. Message flow: the consent paragraph. Opt-in proof: public
links to the sign-up form screenshot, the lead form screenshot, the
post-submit confirmation, plus the verbal script. Links yes, phone numbers
no, direct lending no, age-gated no. Samples 1-5, keywords and replies as
above.

