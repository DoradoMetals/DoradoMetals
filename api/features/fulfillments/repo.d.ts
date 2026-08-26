import type { PoolClient } from "pg";
import type { FulfillmentWire } from "@dorado/contracts";

/**
 * Types the JavaScript fulfillments repo. See methods/repo.d.ts for why a
 * declaration rather than a conversion, and shared/db/query.d.ts for the
 * precedent.
 *
 * created_at and updated_at are Dates: they are plain columns. The nested
 * `method` and the booking detail are built with jsonb_build_object and DO
 * arrive as strings, which is what the contract says and it is right about
 * both - see the note in contracts/wire/fulfillments.ts.
 */
export type FulfillmentRow = Omit<FulfillmentWire, "created_at" | "updated_at"> & {
  created_at: Date;
  updated_at: Date;
};

export function getByOrder(
  order_id: string,
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function getById(id: string, executor?: PoolClient): Promise<FulfillmentRow | null>;

/**
 * The user_id of the ORDER a fulfillment belongs to, or null. A fulfillment
 * carries no user of its own, so this is how "is this yours" is answered.
 */
export function ownerOf(order_id: string, executor?: PoolClient): Promise<string | null>;

export function getScheduled(
  filters?: { from?: string; to?: string; employee_id?: string },
  executor?: PoolClient
): Promise<FulfillmentRow[]>;

/**
 * Creates one, or returns the existing one - a second call for the same order
 * conflicts and does nothing rather than making a duplicate.
 */
export function create(
  args: {
    order_id: string;
    method_id: string;
    status?: string;
    created_by_id?: string | null;
  },
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function setStatus(
  args: { id: string; status: string; updated_by_id?: string | null },
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function setMethod(
  args: { id: string; method_id: string; updated_by_id?: string | null },
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function schedulePickup(
  args: {
    fulfillment_id: string;
    pickup_address_id: string;
    assigned_employee_id?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  },
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function scheduleDirect(
  args: {
    fulfillment_id: string;
    location_id: string;
    is_appointment?: boolean;
    assigned_employee_id?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  },
  executor?: PoolClient
): Promise<FulfillmentRow | null>;

export function cancelSchedule(
  fulfillment_id: string,
  executor?: PoolClient
): Promise<FulfillmentRow | null>;
