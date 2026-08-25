// The SQL both order directions read the same way.
//
// A purchase order and a sales order are one table in the new schema -
// orders.orders with a direction - but they are not one response. A purchase
// order carries an offer, a payout and the refiner's numbers; a sales order
// carries sales tax and a payment intent. The wire shapes differ and must keep
// differing: the frontend is coupled to both, and changing a wire shape during a
// schema migration is the one thing CLAUDE.md forbids outright.
//
// So the collapse is not "one response". It is: the parts that ARE the same
// stop being written twice. These three were duplicated field for field between
// features/purchase-orders/repo.next.js and features/sales-orders/repo.next.js,
// checked programmatically rather than by eye before being moved here.
//
// Nothing about which direction is being read appears below. That is the test
// of whether a fragment belongs here at all.

// A shipment, by alias, because a purchase order has two of them - the inbound
// one and the return - and a sales order has one.
//
// shipping_label is a bytea and is base64'd rather than returned raw: the
// driver would hand back a Buffer, which serialises as
// {"type":"Buffer","data":[...]} and turns 23 rows into half a megabyte.
export const shipmentJson = (alias) => `
      jsonb_build_object(
        'id', ${alias}.id,
        'purchase_order_id', ${alias}.purchase_order_id,
        'sales_order_id', ${alias}.sales_order_id,
        'tracking_number', ${alias}.tracking_number,
        'shipping_status', ${alias}.shipping_status,
        'estimated_delivery', ${alias}.estimated_delivery,
        'shipped_at', ${alias}.shipped_at,
        'delivered_at', ${alias}.delivered_at,
        'created_at', ${alias}.created_at,
        'label_type', ${alias}.label_type,
        'pickup_type', ${alias}.pickup_type,
        'package', ${alias}.package,
        'shipping_label', encode(${alias}.shipping_label, 'base64'),
        'shipping_charge', ${alias}.net_charge,
        'shipping_service', ${alias}.service_type,
        'insured', ${alias}.insured,
        'declared_value', ${alias}.declared_value,
        'type', ${alias}.type,
        'carrier_id', ${alias}.carrier_id
      )`;

// Who placed it. Three fields, deliberately: an order response is not the place
// to widen what is known about a customer, and both directions have always
// returned exactly these.
export const userJson = (alias = "u") => `
      jsonb_build_object(
        'user_id', ${alias}.id,
        'user_name', ${alias}.name,
        'user_email', ${alias}.email
      )`;

// Where it came from or went to. The id returned by the surrounding query is
// the address-BOOK id the snapshot was taken from, not the snapshot's, because
// the frontend posts it back at checkout and the API resolves it against
// exchange.addresses. That is a property of the columns around this, not of
// this, which is why it is only noted here.
export const addressJson = (alias = "addr") => `to_jsonb(${alias})`;

// The joins that reach the three objects above, given orders.orders aliased o.
// Shipments and users are still read from exchange, unmigrated.
export const commonJoins = `
    LEFT JOIN orders.addresses oa ON oa.order_id = o.id
    LEFT JOIN exchange.addresses addr ON addr.id = oa.source_address_id
    LEFT JOIN exchange.users u ON u.id = o.user_id`;
