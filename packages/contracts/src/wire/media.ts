import { z } from "zod/v4";
import { ImagesRow } from "../generated/exchange.js";

// What the repos return: media.images' own name for the column.
//
// This is the internal truth - both implementations produce it, exchange by
// aliasing checksum_sha256 up to checksum.
export const ImageWireNext = ImagesRow.omit({ checksum_sha256: true }).extend({
  checksum: z.string().nullable(),
});
export type ImageWireNext = z.infer<typeof ImageWireNext>;

// What the frontend still reads. Produced by features/media/wire.js on the way
// out, behind MEDIA_WIRE=legacy, and deleted when the frontend stops reading it.
//
// Derived from ImageWireNext rather than restated, so the two cannot drift: a
// column added to images appears in both and the only difference stays the
// rename.
export const ImageWire = ImageWireNext.omit({ checksum: true }).extend({
  checksum_sha256: z.string().nullable(),
});
export type ImageWire = z.infer<typeof ImageWire>;
