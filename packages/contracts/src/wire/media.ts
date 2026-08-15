import { z } from "zod/v4";
import { ImagesRow } from "../generated/tables.js";

export const ImageWire = ImagesRow;
export type ImageWire = z.infer<typeof ImageWire>;
