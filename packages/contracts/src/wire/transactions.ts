import { z } from "zod/v4";
import { AccountTransactionsRow } from "../generated/exchange.js";

export const AccountTransaction = AccountTransactionsRow;
export type AccountTransaction = z.infer<typeof AccountTransaction>;
