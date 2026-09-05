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

export async function metalIds(c: PoolClient): Promise<string[]> {
  const { rows } = await c.query<{ id: string }>(`SELECT id FROM metals.metals ORDER BY id`);
  return rows.map((r) => r.id);
}

export async function mintId(c: PoolClient): Promise<string> {
  const row = await one<{ id: string }>(
    c, "a mint", `SELECT id FROM products.mints ORDER BY name`, []
  );
  return row.id;
}

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

export async function refinerNamed(c: PoolClient, name: string): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the refinery "${name}"`,
    `SELECT r.id FROM refiners.refiners r
       JOIN organizations.organizations o ON o.id = r.organization_id
      WHERE o.name = $1`, [name]
  );
  return row.id;
}

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

export async function carrierServiceId(
  c: PoolClient, name = "Express Saver"
): Promise<string> {
  const row = await one<{ id: string }>(
    c, `the carrier service "${name}"`,
    `SELECT id FROM shipping.services WHERE name = $1 AND carrier_id IS NOT NULL`, [name]
  );
  return row.id;
}

export async function saleServiceId(c: PoolClient): Promise<string> {
  const row = await one<{ id: string }>(
    c, "a sale delivery service",
    `SELECT id FROM shipping.services WHERE carrier_id IS NULL AND price IS NOT NULL
      ORDER BY name`, []
  );
  return row.id;
}

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

export function shipmentDirection(direction: "purchase" | "sale"): "Inbound" | "Outbound" {
  return direction === "purchase" ? "Inbound" : "Outbound";
}
