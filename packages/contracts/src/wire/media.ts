import { z } from "zod/v4";
import { ImagesRow } from "../generated/exchange.js";

export const ImageWire = ImagesRow;
export type ImageWire = z.infer<typeof ImageWire>;
