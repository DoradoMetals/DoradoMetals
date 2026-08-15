import { z } from "zod/v4";
import { SuppliersRow } from "../generated/tables.js";

export const SupplierWire = SuppliersRow;
export type SupplierWire = z.infer<typeof SupplierWire>;
