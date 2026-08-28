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
// features/purchase-orders/repo.next.ts and features/sales-orders/repo.next.ts,
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
export const shipmentJson = (alias: string) => `
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

// The joins both directions make, given orders.orders aliased o.
//
// Every one is a LEFT JOIN on an independent condition, so the ORDER of these
// lines carries no meaning to Postgres - but the DEPENDENCIES do, and they are
// why this list is in the order it is: oa before addr, i before b before bm.
// A direction adds its own joins after these, and anything depending on `i`
// still finds it.
//
// Shipments and users are still read from exchange, unmigrated - which is why
// two of these cross schemas and will move when auth and shipping do.
export const sharedJoins = `
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    LEFT JOIN orders.items i ON i.order_id = o.id
    LEFT JOIN products.bullion b ON b.id = i.bullion_id
    LEFT JOIN metals.metals bm ON bm.id = b.metal_id
    LEFT JOIN products.mints mnt ON mnt.id = b.mint_id
    LEFT JOIN orders.addresses oa ON oa.order_id = o.id
    LEFT JOIN exchange.addresses addr ON addr.id = oa.source_address_id
    LEFT JOIN exchange.users u ON u.id = o.user_id`;

// THE COLUMN LISTS ARE DELIBERATELY NOT SHARED, and this is the note that
// stops somebody trying it a third time.
//
// Comparing the two ORDER_COLUMNS lists programmatically says it should work:
// ten of the twenty-five match on alias AND expression - id, user_id,
// address_id, notes, created_at, updated_at, created_by, updated_by,
// order_number, review_created - and ZERO share an alias while meaning
// different things, which is the dangerous case and it is absent.
//
// It was extracted, and `diff` caught it: 3 operations diverged on each
// direction. Not a lost column - a MOVED one. Putting the shared ten first
// changes the order of the keys in the JSON, and the comparison serialises the
// row. `sales_order_status` was still there; it had shifted from fourth to
// eleventh.
//
// Two ways out, and only one of them is honest. The comparison could be made
// order-insensitive - key order is not something a frontend depends on - but
// weakening the gate so a refactor can pass is how gates die. Or the columns
// could be interleaved back into their original positions, which defeats the
// extraction.
//
// So it was reverted. Ten short lines of duplication, against a reordered
// response and a weaker diff. The fragments below are shared because they are
// self-contained values; a SELECT list is an ordered thing and sharing part of
// one is not free.

// One order, newest first, with the id breaking the tie - o.created_at is not
// unique and a read whose ORDER BY is not unique returns physical order, which
// makes two implementations look like they disagree when they do not.
export const newestFirst = "ORDER BY o.created_at DESC, o.id DESC";
