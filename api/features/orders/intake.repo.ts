// Turning the description into rows: resolving names to ids, and recording the
// choices on the checkout.
//
// features/orders/intake.ts says what the customer asked for, in names. This
// says where those names live. The split is deliberate - deciding what somebody
// asked for is a question about the request, and finding the row that means it
// is a question about the database, and mixing them makes both untestable.
//
// THE CHECKOUT IS THE CART. checkout.checkouts has UNIQUE (user_id, direction)
// and features/checkout already writes one per user per direction as the cart
// syncs. So placing an order does not create a checkout; it COMPLETES the one
// that is already there, filling in the columns the cart never touches -
// which method, which addresses, which service, which package, when.
//
// Those columns have been empty since January. This is the first code that
// writes any of them.
import type { PoolClient } from "pg";

import query from "#shared/db/query.ts";

// The shared executor, optional on every one of these: passing it is how a
// repo call joins its caller's transaction, and omitting it runs on the pool.
type Executor = PoolClient | undefined;

// Ids are uuids on every one of these tables.
type Id = string | null;

// ------------------------------------------------------------------ resolving
//
// Each of these answers "which row does this name mean". They return null
// rather than throwing, so the caller decides whether a missing reference is
// fatal - a package that cannot be resolved is a detail, a fulfillment method
// that cannot be is not.

export async function methodId(
  { type, direction }: { type?: string | null; direction?: string },
  executor?: Executor
): Promise<Id> {
  if (!type) return null;
  const { rows } = await query(
    `SELECT id FROM fulfillments.methods
      WHERE type = $1 AND direction = $2::orders.direction
      LIMIT 1`,
    [type, direction],
    executor
  );
  return rows[0]?.id ?? null;
}

// Resolved by NAME, because there is nothing else to resolve it by.
//
// The frontend identifies a service three ways - serviceType
// ('FEDEX_EXPRESS_SAVER'), serviceDescription ('Express Saver') and code
// ('FDXE') - and of the three only the description matches anything stored.
// shipping.services.code and .provider_code are NULL on every row in dev AND in
// production, and so are exchange.carrier_services' - checked, not assumed. So
// neither schema has ever recorded which carrier enum a shipment used.
//
// That makes this resolution depend on a human-readable string matching
// exactly, which is fragile in a specific way worth naming: renaming a service
// in the admin table silently stops new orders resolving it. Storing the
// provider code would fix it and is a schema change, not a migration one.
export async function serviceId(
  { description, carrierName = "FedEx" }: { description?: string | null; carrierName?: string },
  executor?: Executor
): Promise<Id> {
  if (!description) return null;
  const { rows } = await query(
    `SELECT s.id
       FROM shipping.services s
       JOIN shipping.carriers c ON c.id = s.carrier_id
       JOIN organizations.organizations o ON o.id = c.organization_id
      WHERE lower(s.name) = lower($1) AND lower(o.name) = lower($2)
      LIMIT 1`,
    [description, carrierName],
    executor
  );
  return rows[0]?.id ?? null;
}

// The carrier has to be part of this. shipping.packages holds nine rows and
// three labels appear twice - 'Small Box', 'Medium Box' and 'Large Box' exist
// for both FedEx and UPS - so a label alone resolves to whichever row Postgres
// happens to return first, which is a coin toss that would look like it worked.
export async function packageId(
  { label, carrierName = "FedEx" }: { label?: string | null; carrierName?: string },
  executor?: Executor
): Promise<Id> {
  if (!label) return null;
  const { rows } = await query(
    `SELECT p.id
       FROM shipping.packages p
       JOIN shipping.carriers c ON c.id = p.carrier_id
       JOIN organizations.organizations o ON o.id = c.organization_id
      WHERE lower(p.label) = lower($1) AND lower(o.name) = lower($2)
      LIMIT 1`,
    [label, carrierName],
    executor
  );
  return rows[0]?.id ?? null;
}

// By type rather than by name, the same way 052 resolves them: renaming a
// location must not break what it means.
export async function locationId(type: string | null | undefined, executor?: Executor): Promise<Id> {
  if (!type) return null;
  const { rows } = await query(
    `SELECT id FROM places.locations WHERE type = $1 LIMIT 1`,
    [type],
    executor
  );
  return rows[0]?.id ?? null;
}

// The payout method a customer chose - ACH, WIRE, ECHECK - as a row in
// payments.methods rather than a string on the payout. exchange keeps the word.
export async function paymentMethodId(
  { type, direction }: { type?: string | null; direction?: string },
  executor?: Executor
): Promise<Id> {
  if (!type) return null;
  const { rows } = await query(
    `SELECT id FROM payments.methods
      WHERE upper(type) = upper($1) AND direction = $2
      LIMIT 1`,
    [type, direction],
    executor
  );
  return rows[0]?.id ?? null;
}

// ----------------------------------------------------------------- resolving
//
// The whole description at once, so the caller gets one object of ids and the
// per-name lookups above stay small enough to test individually.
export async function resolve(described: any, executor?: Executor) {
  const { direction, fulfillment = {} } = described;
  const carrierName = "FedEx";

  const [method, service, pkg, appointment, payment] = await Promise.all([
    methodId({ type: fulfillment.method_type, direction }, executor),
    serviceId(
      { description: fulfillment.shipment?.service_description, carrierName },
      executor
    ),
    packageId({ label: fulfillment.shipment?.package_label, carrierName }, executor),
    locationId(fulfillment.direct?.location_type, executor),
    paymentMethodId({ type: described.payout?.method, direction }, executor),
  ]);

  // A method that will not resolve is fatal and the others are not. Every other
  // reference is a detail of how the handover happens; the method is what says
  // it happens at all, and a fulfillment with no method cannot be written -
  // fulfillments.method_id is NOT NULL.
  if (fulfillment.method_type && !method) {
    throw new Error(
      `no fulfillment method "${fulfillment.method_type}" for a ${direction} - ` +
        `047_seed_reference_data.sql lists the eleven that exist`
    );
  }

  return {
    fulfillment_method_id: method,
    carrier_service_id: service,
    package_id: pkg,
    appointment_location_id: appointment,
    payment_method_id: payment,
  };
}

// ------------------------------------------------------------------ recording
//
// Writes the choices onto the checkout the cart already made, and replaces its
// items with the ones the order was submitted with.
//
// THE ITEMS ARE REPLACED ON PURPOSE. checkout.items is written as the cart
// syncs, and the block posted at submit time is what the customer is actually
// agreeing to - a second tab, a stale page or a failed sync would otherwise
// place an order for a different set of lines than the one on screen. The
// submitted block wins.
export async function record(
  { described, ids, address_id }: { described: any; ids: any; address_id?: string | null },
  executor?: Executor
) {
  const { direction, user_id } = described;
  const f = described.fulfillment ?? {};

  const { rows } = await query(
    `INSERT INTO checkout.checkouts (user_id, direction)
     VALUES ($1, $2)
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`,
    [user_id, direction],
    executor
  );
  const checkout_id = rows[0].id;

  await query(
    `UPDATE checkout.checkouts SET
       fulfillment_method_id   = $2,
       carrier_service_id      = $3,
       package_id              = $4,
       appointment_location_id = $5,
       payment_method_id       = $6,
       shipper_address_id      = $7,
       recipient_address_id    = $8,
       pickup_address_id       = $9,
       appointment_time        = $10
     WHERE id = $1`,
    [
      checkout_id,
      ids.fulfillment_method_id,
      ids.carrier_service_id,
      ids.package_id,
      ids.appointment_location_id,
      ids.payment_method_id,
      f.shipment?.shipper_address ? address_id : null,
      f.shipment?.recipient_address ? address_id : null,
      f.pickup ? address_id : null,
      f.direct?.start_time ?? null,
    ],
    executor
  );

  await query(`DELETE FROM checkout.items WHERE checkout_id = $1`, [checkout_id], executor);

  for (const item of described.items) {
    await query(
      `INSERT INTO checkout.items (
         checkout_id, bullion_id, metal_id,
         pre_melt, post_melt, purity, content, unit, premium, quantity
       ) VALUES (
         $1, $2,
         (SELECT id FROM metals.metals WHERE lower(name) = lower($3)),
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        checkout_id,
        item.bullion_id ?? null,
        item.metal ?? null,
        item.pre_melt ?? null,
        item.post_melt ?? null,
        item.purity ?? null,
        item.content ?? null,
        item.unit ?? null,
        item.premium ?? null,
        item.quantity ?? 1,
      ],
      executor
    );
  }

  return checkout_id;
}
