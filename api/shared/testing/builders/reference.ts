// REFERENCE DATA IS RESOLVED BY NAME, NEVER BY "whatever row is first".
//
// *** THE DISTINCTION THIS FILE EXISTS TO DRAW. *** Lane 1 deletes 200-odd
// `SELECT ... LIMIT 1` FIXTURE discoveries, because a test whose subject is
// "an order" must build the order it means. Reference rows are the other
// thing: `metals.metals` holds exactly four rows and one of them IS Gold,
// `fulfillments.methods` holds one CARRIER DROPOFF per direction, and
// migration 047 seeds all of them. Naming Gold is not discovery - it is the
// literal the test means, and building a second Gold would be wrong.
//
// So the rule is: a reference row is looked up BY ITS OWN NAME, in ONE place
// (here), and the lookup says out loud when the seed is missing rather than
// returning undefined into an assertion. Nothing in a test file does this by
// hand any more.
//
// The reads take the caller's client so they see the caller's transaction -
// a test that has just created a mint must be able to resolve it.
import type { PoolClient } from "pg";

async function one<T>(c: PoolClient, what: string, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await c.query(sql, params);
  if (rows.length === 0) {
    throw new Error(
      `the test database has no ${what} - reference data is seeded by ` +
      `migration 047; run \`pnpm --filter @dorado/api provision:test -- --commit\``
    );
  }
  return rows[0] as T;
}

export type MetalName = "Gold" | "Silver" | "Platinum" | "Palladium";

export async function metalId(c: PoolClient, name: MetalName = "Gold"): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the metal "${name}"`, `SELECT id FROM metals.metals WHERE name = $1`, [name]
  );
  return row.id;
}

export async function metalIds(c: PoolClient): Promise<Map<string, string>> {
  const { rows } = await c.query<{ id: string; name: string }>(
    `SELECT id, name FROM metals.metals`
  );
  return new Map(rows.map((r) => [r.name, r.id]));
}

// The mint and the supplier a built product hangs off. Both are organisations
// in the seed; a product needs one of each and cares about neither.
export async function mintId(c: PoolClient): Promise<string> {
  const row = await one<{ id: string }>(
    c, "a mint", `SELECT id FROM products.mints ORDER BY name`, []
  );
  return row.id;
}

// A PRODUCT'S SUPPLIER IS A REFINERY, not an organisation - products.bullion.
// supplier_id is a foreign key to refiners.refiners, which is easy to get
// wrong because a refiner IS an organisation one join further out.
export async function supplierId(c: PoolClient): Promise<string> {
  const row = await one<{ id: string }>(
    c, "a supplier (refiners.refiners)",
    `SELECT r.id FROM refiners.refiners r
       JOIN organizations.organizations o ON o.id = r.organization_id
      ORDER BY o.name`, []
  );
  return row.id;
}

export async function refinerId(c: PoolClient): Promise<string> {
  return supplierId(c);
}

// A refinery BY NAME. Two rows, seeded, and they differ in exactly the way the
// send path cares about: "Elemetal" has an email address and "Dillion Gage"
// does not - which is also true in production, and is why the refusal exists.
export async function refinerNamed(c: PoolClient, name: string): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the refinery "${name}"`,
    `SELECT r.id FROM refiners.refiners r
       JOIN organizations.organizations o ON o.id = r.organization_id
      WHERE o.name = $1`, [name]
  );
  return row.id;
}

// The two the send path distinguishes, asserted to still differ - a seed change
// that gave Dillion Gage an email would otherwise make the refusal test pass
// for the wrong reason.
export async function refinersByEmail(
  c: PoolClient
): Promise<{ withEmail: string; withoutEmail: string }> {
  const { rows } = await c.query<{ id: string; name: string; email: string | null }>(
    `SELECT r.id, o.name, o.email FROM refiners.refiners r
       JOIN organizations.organizations o ON o.id = r.organization_id
      ORDER BY o.name`
  );
  const withEmail = rows.find((r) => r.email);
  const withoutEmail = rows.find((r) => !r.email);
  if (!withEmail || !withoutEmail) {
    throw new Error(
      "the refiners seed no longer has one refinery with an email and one without - " +
      "the send path's refusal cannot be told from its success"
    );
  }
  return { withEmail: withEmail.id, withoutEmail: withoutEmail.id };
}

// fulfillments.methods, by the two columns that identify one: its TYPE and its
// direction. "CARRIER DROPOFF"/purchase is one row and always the same one.
export async function fulfillmentMethodId(
  c: PoolClient, type: string, direction: "purchase" | "sale"
): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the ${direction} fulfillment method "${type}"`,
    `SELECT id FROM fulfillments.methods WHERE type = $1 AND direction = $2::orders.direction`,
    [type, direction]
  );
  return row.id;
}

// payments.methods, same shape: ACH/purchase, CARD/sale.
export async function paymentMethodId(
  c: PoolClient, type: string, direction: "purchase" | "sale"
): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the ${direction} payment method "${type}"`,
    `SELECT id FROM payments.methods WHERE type = $1 AND direction = $2::orders.direction`,
    [type, direction]
  );
  return row.id;
}

// A real carrier service the catalogue offers - `carrier_id IS NOT NULL` is
// what makes it a LABEL service rather than a priced sale-delivery row.
export async function carrierServiceId(
  c: PoolClient, name = "Express Saver"
): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the carrier service "${name}"`,
    `SELECT id FROM shipping.services WHERE name = $1 AND carrier_id IS NOT NULL`, [name]
  );
  return row.id;
}

// The other kind: carrier-agnostic, priced, what a sale is delivered on.
export async function saleServiceId(c: PoolClient): Promise<string> {
  const row = await one<{ id: string }>(
    c, "a sale delivery service",
    `SELECT id FROM shipping.services WHERE carrier_id IS NULL AND price IS NOT NULL
      ORDER BY name`, []
  );
  return row.id;
}

// A CARRIER BY NAME. shipping.carriers has no name column of its own - the
// name is its organisation's - so this is the join that a test naming "FedEx"
// actually means. Reference data: two carriers, seeded by 047.
export async function carrierId(c: PoolClient, name = "FedEx"): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the carrier "${name}"`,
    `SELECT ca.id FROM shipping.carriers ca
       JOIN organizations.organizations o ON o.id = ca.organization_id
      WHERE o.name = $1`, [name]
  );
  return row.id;
}

export async function packageId(c: PoolClient, label = "Small Box"): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the package "${label}"`,
    `SELECT id FROM shipping.packages WHERE label = $1 AND carrier_id IS NULL
      ORDER BY id`, [label]
  );
  return row.id;
}

// shipping.shipments.direction is its OWN enum and does not share the orders
// one: a purchase arrives (Inbound), a sale leaves (Outbound). Getting this
// wrong raises 22P02 rather than writing a wrong row, which is the good case.
export function shipmentDirection(direction: "purchase" | "sale"): "Inbound" | "Outbound" {
  return direction === "purchase" ? "Inbound" : "Outbound";
}
