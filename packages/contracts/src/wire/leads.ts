import { z } from "zod/v4";
import { LeadsRow } from "../generated/tables.js";

export const LeadWire = LeadsRow;
export type LeadWire = z.infer<typeof LeadWire>;

// The server owns identity, timestamps and audit columns.
export const CreateLeadBody = LeadsRow.omit({
  id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
});
export type CreateLeadBody = z.infer<typeof CreateLeadBody>;
