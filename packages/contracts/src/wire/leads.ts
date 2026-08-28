import { z } from "zod/v4";
import { LeadsRow } from "../generated/exchange.js";

export const Lead = LeadsRow;
export type Lead = z.infer<typeof Lead>;

// The server owns identity, timestamps and audit columns.
export const CreateLeadBody = LeadsRow.omit({
  id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
});
export type CreateLeadBody = z.infer<typeof CreateLeadBody>;
