-- THE METHOD TABLES BECOME THE SOURCE THE FRONTEND READS (D207).
--
-- Jacob, 2026-09-01: "Shouldn't a lot of those be coming from the database
-- now? Like payment methods, service options... And I guess if the methods
-- don't exist, they should probably be added to the db in a migration."
--
-- The look confirmed three states:
--
--   payments.methods    EXISTS and is nearly complete - 047 seeded both
--                       directions with fees, delays, labels and most of the
--                       payout marketing copy - but two rows carry January's
--                       vocabulary, and two copy fields the live frontend
--                       ships were never seeded.
--   fulfillments.methods EXISTS, is served by GET /fulfillments/methods, and
--                       needs nothing here.
--   sale delivery tiers DO NOT EXIST anywhere. Standard $25 / Overnight $50 /
--                       free-over-$1000 live only in code (pricing/ask.ts
--                       getShippingCharge) and in two hardcoded frontend
--                       records. The 'Standard'/'Overnight'/'Free' rows in
--                       shipping.services are NOT them - those are
--                       carrier-service rows, duplicated per carrier, with no
--                       price; the tier is a pricing concept with no carrier.
--
-- Everything here is additive or an in-place correction of seeded reference
-- rows in the NEW schemas. exchange is not touched.

-- ---------------------------------------------------------------- vocabulary
--
-- The stored data decides who wins. exchange.payouts.method says
-- DORADO_ACCOUNT on dev AND production; the checkout schemas and
-- calculateSalesOrderTotal say CREDIT. The two rows below are January's names
-- for the same things, and nothing resolves through them today (updateMethod's
-- CASE only maps Stripe instrument strings), so the rename bites nobody and
-- unblocks the frontend reading `type` as its method key.

UPDATE payments.methods
   SET type = 'CREDIT', updated_at = now()
 WHERE direction = 'sale' AND type = 'DORADO DEBIT';

UPDATE payments.methods
   SET type = 'DORADO_ACCOUNT', updated_at = now()
 WHERE direction = 'purchase' AND type = 'DORADO CREDIT';

-- ------------------------------------------------------------- payout copy
--
-- The payout landing page and the checkout's payout step ship four blocks of
-- marketing copy per method (frontend/features/payouts/types.ts). 047 seeded
-- most of it, inconsistently: ACH's long_description held the short paragraph
-- while WIRE's held the long intro, fit_description was empty everywhere, and
-- the closing `details` paragraphs had no column at all. Normalised here from
-- the LIVE frontend copy, which is the version customers see today:
--
--   long_description  the one-line paragraph under the option card
--   fit_description   the long intro above the "great fit" block
--   fit_header        the "X is a great fit if you:" heading   (already right)
--   fit_bullets       the fit bullet list                      (already right)
--   details           the closing "how it works" paragraphs    (new column)

ALTER TABLE payments.methods ADD COLUMN IF NOT EXISTS details text[];

UPDATE payments.methods SET
  long_description = $txt$Direct deposit to your U.S. bank account via ACH. A low-fee option that typically arrives in 1-3 business days.$txt$,
  fit_description  = $txt$ACH (Automated Clearing House) is one of the most common and trusted ways to move money between banks in the U.S. With this option, we send your payout directly to your checking or savings account—no paper checks, no branch visits, and no extra steps once it's set up.$txt$,
  details = ARRAY[
    $txt$Once your metal is received, verified, and your payout is approved, we initiate the transfer the same business day whenever possible (subject to our processing cutoff times). From there, your bank's ACH schedule determines when the funds show up, but you'll receive a confirmation from us as soon as the transfer is sent.$txt$,
    $txt$All you need is your bank name, routing number, and account number. We transmit this information securely and never use it for anything other than sending your payout.$txt$
  ],
  updated_at = now()
WHERE direction = 'purchase' AND type = 'ACH';

UPDATE payments.methods SET
  long_description = $txt$Direct wire transfer from our bank to yours. Best for larger payouts when you need funds as quickly as possible.$txt$,
  fit_description  = $txt$Wire transfers are designed for speed and reliability, especially when you're dealing with larger dollar amounts. With a wire, funds are sent directly from our bank to yours, often arriving the same business day once the wire is released (depending on bank cut-off times and your bank's policies).$txt$,
  details = ARRAY[
    $txt$After your shipment is received and your payout is approved, we prepare and release the wire during our normal banking hours. You'll receive a confirmation with the amount and reference details so you can easily track it with your bank.$txt$,
    $txt$Some banks may place temporary holds on large incoming wires or require additional verification. While that's outside our control, we're happy to provide any supporting documentation you might need if your bank asks for it.$txt$
  ],
  updated_at = now()
WHERE direction = 'purchase' AND type = 'WIRE';

UPDATE payments.methods SET
  long_description = $txt$Digital check delivered to your email. Print and deposit, or use mobile deposit at most banks and credit unions.$txt$,
  fit_description  = $txt$A Deluxe eCheck gives you the convenience of a traditional check without waiting for the mail. Once your payout is ready, we issue a secure digital check and send it straight to your email.$txt$,
  details = ARRAY[
    $txt$From your email, you can print the check and deposit it in person, use your bank's mobile app to deposit from your phone, or use supported Deluxe tools for direct electronic deposit.$txt$,
    $txt$We typically issue eChecks the same day your payout is finalized. The check is drawn on a standard U.S. bank account and is processed by your bank just like any other check, subject to their normal hold times. All you need is a valid email address you can access securely.$txt$
  ],
  updated_at = now()
WHERE direction = 'purchase' AND type = 'ECHECK';

UPDATE payments.methods SET
  long_description = $txt$Convert your payout directly into eligible coins and bars instead of taking cash. Bullion is fully insured and shipped to you.$txt$,
  fit_description  = $txt$If your goal is to build or grow your precious-metals holdings, you don't have to take your payout in cash at all. With Bullion Exchange, you can apply some or all of your proceeds toward eligible coins and bars instead of receiving a cash payment.$txt$,
  details = ARRAY[
    $txt$Once your metal is received and your payout is calculated, you can choose the bullion you'd like from our available inventory. We lock in pricing at the time of your selection, provide a clear breakdown of how your payout is applied (including any premiums and shipping), and confirm your final order total before anything is finalized.$txt$,
    $txt$After you approve the conversion, your bullion order is packed, fully insured, and shipped to you—typically within about a week, depending on product availability and shipping method. You'll receive tracking information so you can follow delivery every step of the way.$txt$
  ],
  updated_at = now()
WHERE direction = 'purchase' AND type = 'DORADO_ACCOUNT';

-- What is deliberately NOT touched: the sale ACH row's 0.5% surcharge and the
-- CREDIT/WIRE rows' "No Fee" labels. calculateCardCharge charges ACH 0.5% and
-- everything else 2.9% - CREDIT and WIRE included, against their labels -
-- and that open money question is FOLLOWUPS item 1's, not a reference-data
-- migration's. The rows match what customers SEE today, which is what a
-- display-neutral conversion needs.

-- ------------------------------------------------------------ shipping.tiers
--
-- How fast a SALE ships and what the customer pays for it. Not a carrier
-- service: the tier has no carrier, no capability flags, and its price is the
-- checkout's, set by the business. getShippingCharge (pricing/ask.ts) remains
-- the pricing authority for now - a pure function inside pure pricing - and
-- features/pricing/tests pins these rows to its constants so the two sources
-- cannot drift silently. free_over is the order-total threshold above which
-- the tier costs nothing (item_total > 1000 ships free today, on every tier
-- that has one). FREE is the admin drawer's grant and hidden from customers.

CREATE TABLE IF NOT EXISTS shipping.tiers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  label        text NOT NULL,
  price        numeric NOT NULL,
  free_over    numeric,
  transit_label text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  display      boolean NOT NULL DEFAULT true,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO shipping.tiers (code, label, price, free_over, transit_label, sort_order, display, enabled)
VALUES
  ('STANDARD',  'Standard',  25, 1000, '3 Days', 10, true,  true),
  ('OVERNIGHT', 'Overnight', 50, 1000, '1 Day',  20, true,  true),
  ('FREE',      'Free',       0, NULL, '1 Day',  30, false, true)
ON CONFLICT (code) DO NOTHING;
