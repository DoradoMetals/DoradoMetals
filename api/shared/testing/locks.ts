// Advisory locks serializing parallel test files that write the same tables (deadlocks have happened twice without them).
// Always acquired in ascending order — takeLocks sorts — or partitioning reintroduces the deadlock it prevents.
export const LOCKS = {
  // checkout.sell_cart_items and exchange.scrap — same two tables locked in opposite orders otherwise.
  SCRAP_SWEEP: 4207,
  // fulfillments.fulfillments, .pickups, .directs, .shipments
  FULFILLMENTS: 4211,
  // orders.*, refiners.* (written by the order-placing paths), checkout.*, exchange.purchase_orders, exchange.sales_orders
  ORDERS: 4213,
  // exchange.addresses, places.addresses, places.user_addresses.
  // Separate from ORDERS — most address work doesn't touch an order; a file doing both takes both.
  ADDRESSES: 4214,
};

// A missing lock is latent until test timing changes elsewhere in the suite — passing today is not proof one isn't needed.
// A file with no transactions (autocommit, no BEGIN) can't use takeLocks; take a SESSION lock in before()/after() instead.
import { appendFileSync } from "node:fs";
import type { PoolClient } from "pg";

// Set DORADO_LOCK_TRACE to a path to log each lock's wait/hold time as JSON lines; unset (the default) costs nothing.
const TRACE = process.env.DORADO_LOCK_TRACE ?? null;

function trace(record: Record<string, unknown>): void {
  if (!TRACE) return;
  try {
    appendFileSync(TRACE, `${JSON.stringify(record)}\n`);
  } catch {
    // A diagnostic must never fail a test run.
  }
}

export async function takeLocks(
  client: PoolClient, locks: number | number[] | null | undefined
): Promise<void> {
  const wanted = (Array.isArray(locks) ? locks : [locks]).filter((l): l is number => Boolean(l));
  const ids = [...new Set(wanted)].sort((a, b) => a - b);
  for (const id of ids) {
    const asked = Date.now();
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
    trace({ event: "acquired", id, file: process.argv[1], wait_ms: Date.now() - asked });
  }
  if (!TRACE || ids.length === 0) return;

  // Hold ends at COMMIT/ROLLBACK (pg_advisory_xact_lock's own release point) — hooked here rather than guessed.
  const held = Date.now();
  const realQuery = client.query.bind(client);
  (client as unknown as { query: unknown }).query = (sql: unknown, params?: unknown[]) => {
    const text = typeof sql === "string" ? sql.trim().toUpperCase() : "";
    if (text === "COMMIT" || text === "ROLLBACK") {
      for (const id of ids) {
        trace({ event: "released", id, file: process.argv[1], hold_ms: Date.now() - held });
      }
      (client as unknown as { query: unknown }).query = realQuery;
    }
    return realQuery(sql as never, params as never);
  };
}
