// Media types, FROM THE CONTRACTS.
//
// FIRST CONVERTED FEATURE. This file used to hand-write `Image` - twelve
// fields transcribed from memory, checked against nothing, which is exactly
// the gap audit:wire-readiness exists to measure. It now imports the shape the
// API actually serves: ImageWireNext is derived from the generated ImagesRow
// in @dorado/contracts, so a column change regenerates through to here and
// `tsc` sees a rename from BOTH sides for the first time.
//
// The hand-written version also disagreed with reality in three places the
// conversion surfaced: width/height are nullable in the database and were not
// here, metadata is jsonb (unknown) not string, and mime_type/size_bytes had
// drifted looser than the wire. Nothing read the wrong fields - which is luck,
// not safety.
import type { ImageWireNext } from "@dorado/contracts";

// What the API adds on top of the row: reads attach a presigned GET url.
export type Image = ImageWireNext & { url: string };

// The upload flow's own shapes - these are request/response bodies of
// /images/upload, not rows, so they stay local.
export interface ImageUpload {
  path: string;
  file: File;
}

export interface ImageUploadReturn {
  id: string;
  uploadUrl: string;
}
