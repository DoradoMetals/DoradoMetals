import { z } from "zod/v4";
import { ImagesRow } from "../generated/media.js";
import { OrdersRow } from "../generated/orders.js";

// SOURCED FROM THE LIVE `media` SCHEMA, NOT `exchange`. This used to import
// exchange's ImagesRow and adapt it (exchange aliased `checksum_sha256` up to
// `checksum`) - media.images has no such column to alias, it is already
// named `checksum`, so the omit/extend existed only to paper over the wrong
// source schema. db/media/images/repo.ts's own `ImageRow` is `media.ImagesRow`
// directly; this now matches it exactly.
export const Image = ImagesRow;
export type Image = z.infer<typeof Image>;

// The legacy ImageWire shape (checksum_sha256) lived here until 2026-08-27,
// "deleted when the frontend stops reading it" - its own words. The frontend
// stopped: features/media/types.ts derives from this shape, the adapter and
// its mount are gone, and audit:wire-readiness had the legacy read count at
// zero before the flip. Media is the first feature all the way through the
// conversion; the -WireNext suffix retired 2026-08-28 with the last of the
// migration vocabulary.

// POST /media/images/upload - a presigned-PUT request. The server names the
// object (see media/images/service.ts's own comment: path/filename used to
// come from the request, so a caller could aim a presigned write at any key
// in the bucket); `filename` survives only as a sanitised suffix and `path`
// is not accepted at all any more - it was accepted and silently ignored.
export const MediaUploadBody = ImagesRow.pick({
  mime_type: true,
  size_bytes: true,
  filename: true,
}).extend({
  mime_type: ImagesRow.shape.mime_type.nullable().optional(),
  size_bytes: ImagesRow.shape.size_bytes.optional(),
});
export type MediaUploadBody = z.infer<typeof MediaUploadBody>;

// DELETE /media/images/delete - the id alone; ownership is the session's,
// never the body's (media/images/service.ts's `ownedBy`).
export const MediaDeleteBody = ImagesRow.pick({ id: true });
export type MediaDeleteBody = z.infer<typeof MediaDeleteBody>;

// POST /media/emails/send_created and /send_priced - the order id alone
// (ruling 10). Everything else (recipient, document fields, spot prices)
// is resolved server-side from it (transport/media/emails/controller.ts);
// the body used to be the whole composed order plus the spot feed plus the
// recipient address.
export const SendOrderEmailBody = z.object({
  order_id: OrdersRow.shape.id,
}).strict();
export type SendOrderEmailBody = z.infer<typeof SendOrderEmailBody>;
