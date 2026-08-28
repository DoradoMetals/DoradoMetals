import { z } from "zod/v4";
import { ImagesRow } from "../generated/exchange.js";

// What the repos return: media.images' own name for the column.
//
// This is the internal truth - both implementations produce it, exchange by
// aliasing checksum_sha256 up to checksum.
export const Image = ImagesRow.omit({ checksum_sha256: true }).extend({
  checksum: z.string().nullable(),
});
export type Image = z.infer<typeof Image>;

// The legacy ImageWire shape (checksum_sha256) lived here until 2026-08-27,
// "deleted when the frontend stops reading it" - its own words. The frontend
// stopped: features/media/types.ts derives from this shape, the adapter and
// its mount are gone, and audit:wire-readiness had the legacy read count at
// zero before the flip. Media is the first feature all the way through the
// conversion; the -WireNext suffix retired 2026-08-28 with the last of the
// migration vocabulary.
