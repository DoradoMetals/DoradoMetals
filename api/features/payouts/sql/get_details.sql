-- THE ONE READ THAT CARRIES THE FULL BANK NUMBERS, and the only route allowed
-- to: GET /payouts/:id/details, admin only, fetched one payout at a time by
-- someone about to execute a transfer. Every other projection in this feature
-- is last-4 only, and the order payloads never carry these - the radioactive
-- rule is absolute.
--
-- The VERBATIM exchange.payouts row (ruling 12) - the security carve-out
-- governs every OTHER read, not the details endpoint that exists to serve the
-- full values. Keyed by the payout's OWN id (the order wire serves it as
-- order.payout.id), replacing the order-keyed POST /purchase_orders/get_payout_details.
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type, routing_number, account_number, created_at, email_to, cost
  FROM exchange.payouts
 WHERE id = $1
