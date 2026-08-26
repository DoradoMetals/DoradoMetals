import type { PoolClient } from "pg";
import type { FulfillmentMethodWire } from "@dorado/contracts";

/**
 * Types the JavaScript methods repo, matching shared/db/query.d.ts: the
 * JavaScript callers keep working unchanged while TypeScript ones get a real
 * row instead of the driver's index signature.
 *
 * Without this, TypeScript infers `QueryResultRow` - `{ [column: string]: any }`
 * - from the JavaScript, which is wide enough that `m.id` type-checks and
 * `m.typo` does too. That is worse than `any`, because it looks like a type.
 *
 * The timestamps are Dates here and strings in the contract. A contract
 * describes the WIRE, where JSON.stringify has already been; these are plain
 * columns the driver parses.
 */
export type MethodRow = Omit<FulfillmentMethodWire, "created_at" | "updated_at"> & {
  created_at: Date | null;
  updated_at: Date | null;
};

/** Enabled, not hidden, and for this direction - the menu a customer is shown. */
export function getAvailable(
  direction: "purchase" | "sale",
  executor?: PoolClient
): Promise<MethodRow[]>;

/** Every method, hidden and disabled ones included. Admin only. */
export function getAll(executor?: PoolClient): Promise<MethodRow[]>;

export function getById(id: string, executor?: PoolClient): Promise<MethodRow | null>;

export function getDefault(
  args: { direction: "purchase" | "sale"; category: "SHIPMENT" | "PICKUP" | "DIRECT" },
  executor?: PoolClient
): Promise<MethodRow | null>;

export function update(
  method: Partial<MethodRow> & { id: string },
  executor?: PoolClient
): Promise<MethodRow | null>;
