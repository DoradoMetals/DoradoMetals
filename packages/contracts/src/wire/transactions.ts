import { z } from "zod/v4";
import { Direction } from "./direction.js";

// The customer credit ledger. One order_id + its direction, not the old
// purchase_order_id/sales_order_id split.
export const AccountTransaction = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  transaction_type: z.string(),
  order_id: z.string().uuid().nullable(),
  direction: Direction.nullable(),
  amount: z.number(),
  occurred_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AccountTransaction = z.infer<typeof AccountTransaction>;

// A new payments.ledger row: ids + the fact, no audit/default columns.
export const NewLedgerEntry = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().nullable(),
  order_id: z.string().uuid().nullable(),
  type: z.string(),
  amount: z.number().nullable(),
});
export type NewLedgerEntry = z.infer<typeof NewLedgerEntry>;
