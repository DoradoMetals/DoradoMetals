// checkout.checkouts, and nothing else.
//
// ONE TABLE FOR BOTH DIRECTIONS. exchange had carts and sell_carts, each UNIQUE
// (user_id); here there is one row per (user_id, direction), taking the same
// values orders.orders uses - 'sale' for buying from us, 'purchase' for selling
// to us - so a checkout and the order it becomes agree.
//
// DEVICE-SYNC, NOT A LEDGER (CLAUDE.md). A session exists so a customer sees
// the same basket on their phone as on their laptop. Empty is fine; losing one
// is fine. What matters is that it works.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf } from "#shared/db/columns.ts";
import { Checkout, CheckoutWrite } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64). `CheckoutWrite` is what the
// SERVER may write - the customer's own choices plus the three pointers the
// services that create what they point at set. Which of these a REQUEST may
// name is a narrower question, answered at the transport boundary by
// `CheckoutPatchBody`.
export const PATCHABLE = columnsOf(CheckoutWrite);
const RETURNING = returningOf(Checkout);

export type { CheckoutWrite } from "@dorado/contracts";

export async function getOne(id: string, executor?: Executor): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(sql("get_one"), [id], executor);
  return rows[0];
}

// The natural key: one session per customer per direction.
export async function findFor(
  user_id: string, direction: string, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(sql("find_for"), [user_id, direction], executor);
  return rows[0];
}

// The draft fulfillment's owner - see sql/find_by_fulfillment.sql.
export async function findByFulfillment(
  fulfillment_id: string, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(
    sql("find_by_fulfillment"), [fulfillment_id], executor
  );
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<Checkout[]> {
  const { rows } = await query<Checkout>(sql("list_for_user"), [user_id], executor);
  return rows;
}

// Answers undefined when a concurrent request won the race - see sql/create.sql.
export async function create(
  // The two columns a session cannot be created without, from the contract -
  // widening either in the database widens this without an edit here.
  row: Pick<Checkout, "user_id" | "direction">, executor?: Executor
): Promise<Checkout | undefined> {
  const { rows } = await query<Checkout>(
    sql("create"), [row.user_id, row.direction], executor
  );
  return rows[0];
}

// Answers THE WRITTEN ROW. Every caller wanted the fresh row and re-read it
// with a second SELECT that could come back empty, so each carried a "the
// checkout session vanished mid-write" refusal for a state RETURNING makes
// unreachable.
export async function update(
  id: string, patch: CheckoutWrite, executor?: Executor
): Promise<Checkout | undefined> {
  const built = buildUpdate({
    table: "checkout.checkouts", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<Checkout>(built.text, built.values, executor);
  return rows[0];
}

// A VISITOR'S ROW CHANGES HANDS (ruling 63). Not part of the patch surface:
// user_id is the row's OWNER, not one of the customer's choices, and putting it
// in PATCHABLE would let a request body name somebody else's id.
export async function reassign(
  id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("reassign"), [id, user_id], executor);
  return rowCount === 1;
}

// THE ONE PLACE THE OWNERSHIP KEYS ARE ALLOWED TO WAIT (migration 126).
//
// checkout.checkouts (user_id, recipient_address_id) references
// places.user_addresses (user_id, address_id), and signing in moves BOTH sides:
// domain/checkout/adopt.ts re-keys the visitor's address book to the customer
// and then re-keys the checkout rows that point at it. Neither order is valid
// statement by statement - move the book first and the checkout points at a row
// that changed hands; move the checkout first and it names a book entry the
// visitor still owns - so this asks Postgres to check it at COMMIT instead,
// for THIS transaction only.
//
// ONE CONSTRAINT NOW, not three: 128 moved the shipper and pickup addresses to
// the draft fulfillment's own detail rows, and their composite keys went with
// the columns.
//
// The constraint is DEFERRABLE INITIALLY IMMEDIATE, so every other write in
// the application is still refused at the statement that makes it. This is the
// deliberate exception, not the default.
export async function deferAddressOwnership(executor?: Executor): Promise<void> {
  await query(
    `SET CONSTRAINTS checkout.checkouts_recipient_address_theirs_fk DEFERRED`,
    [],
    executor
  );
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
