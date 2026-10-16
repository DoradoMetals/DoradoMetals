-- How the customer is paid (ruling 132), as one expression over the
-- orders.orders row `o`: the split rows when an admin added a second method,
-- each with its amount; otherwise the one method chosen at checkout, with no
-- amount - it pays the whole total. Split rows come in the method's
-- sort_order, so every read lists them the same way. Substituted into view.sql and
-- action_facts.sql so add_funds and send_payment read the same split.
COALESCE(
  (SELECT jsonb_agg(
            jsonb_build_object('method_id', pm.method_id, 'method', m.type,
                               'label', m.label, 'amount', pm.amount)
            ORDER BY m.sort_order ASC, pm.id ASC)
     FROM orders.payout_methods pm
     JOIN payments.methods m ON m.id = pm.method_id
    WHERE pm.order_id = o.id),
  (SELECT jsonb_build_array(
            jsonb_build_object('method_id', d.method_id, 'method', m.type,
                               'label', m.label, 'amount', NULL))
     FROM orders.transactions t
     JOIN payments.details d ON d.id = t.payout_details_id
     LEFT JOIN payments.methods m ON m.id = d.method_id
    WHERE t.order_id = o.id),
  '[]'::jsonb)
