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

// The legacy ImageWire shape (checksum_sha256) lived here until 2026-08-27,
// "deleted when the frontend stops reading it" - its own words. The frontend
// stopped: features/media/types.ts derives from ImageWireNext, the adapter and
// its mount are gone, and audit:wire-readiness had the legacy read count at
// zero before the flip. Media is the first feature all the way through the
// conversion.
