import { z } from "zod/v4";
import { AccountTransactionsRow } from "../generated/tables.js";

export const AccountTransactionWire = AccountTransactionsRow;
export type AccountTransactionWire = z.infer<typeof AccountTransactionWire>;
