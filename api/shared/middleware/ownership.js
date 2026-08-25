// Whether the caller owns the order they are acting on.
//
// requireUser asks whether somebody is signed in. It does not ask who, and
// every customer-facing order route takes its order out of the request BODY -
// `const { order } = req.body` - so until this existed a signed-in customer
// could act on any order whose id they had:
//
//   get_purchase_order_metals  200, another customer's frozen spot prices
//   reject_offer               200, another customer's offer rejected
//   update_offer_notes         200, notes written on another customer's order
//   cancel_order               reached the code that buys a FedEx return label
//                              and ships another customer's metal back
//
// Each was demonstrated with a real request before this was written, and the
// tests that demonstrated it are features/purchase-orders/ownership.test.js.
//
// Order ids are uuids rather than sequential, so nobody stumbles into this. It
// is still the difference between "you cannot" and "you probably will not
// guess", and cancel_order costs real money on the way through.
//
// WHY MIDDLEWARE. The check belongs in front of the controller rather than
// inside each service: a service that grew a new caller would need the check
// adding again, and the routes file is where somebody looks to answer "who can
// do this". One line per route, next to the guard it completes.
import query from "#shared/db/query.js";

// The order id, wherever the frontend happens to put it. These are the four
// spellings in use across purchase-orders and sales-orders; a route whose body
// uses none of them is refused rather than waved through, because a guard that
// cannot find its subject must not decide it is fine.
function orderIdFrom(body = {}) {
  return (
    body.order?.id ??
    body.purchase_order_id ??
    body.sales_order_id ??
    body.order_id ??
    null
  );
}

export function requireOwnOrder(req, res, next) {
  // Admins administer every order. requireUser has already run, so req.user is
  // present; a missing one means this was mounted without a guard in front of
  // it, which is a wiring mistake rather than an anonymous caller.
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role === "admin") return next();

  const orderId = orderIdFrom(req.body);
  if (!orderId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "no order was named",
    });
  }

  // Both directions live in one table in the new schema and two in exchange,
  // and this has to answer the same way whichever is serving - so it asks all
  // three rather than depending on ORDERS_SOURCE. A missing row is a refusal:
  // "the order does not exist" and "the order is not yours" are the same answer
  // to somebody who should not know the difference.
  query(
    `SELECT 1 FROM (
       SELECT user_id FROM exchange.purchase_orders WHERE id = $1
       UNION ALL
       SELECT user_id FROM exchange.sales_orders WHERE id = $1
       UNION ALL
       SELECT user_id FROM orders.orders WHERE id = $1
     ) o WHERE o.user_id = $2 LIMIT 1`,
    [orderId, req.user.id]
  )
    .then(({ rows }) => {
      if (!rows.length) {
        return res.status(403).json({
          error: "Forbidden",
          message: "That order is not yours",
        });
      }
      next();
    })
    .catch(next);
}
