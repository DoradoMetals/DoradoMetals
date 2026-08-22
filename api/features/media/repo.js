// Selects which schema the media feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   MEDIA_SOURCE=exchange   (default) read exchange, write exchange
//   MEDIA_SOURCE=dual                 read media,    write BOTH
//   MEDIA_SOURCE=next                 read media,    write media
//
// media.images names one column `checksum` where exchange calls it
// `checksum_sha256`. The reads alias it back, so the wire shape is identical
// either way.
//
// Gate on `pnpm --filter @dorado/api diff media` before promoting.
import * as exchange from "#features/media/repo.exchange.js";
import * as next from "#features/media/repo.next.js";
import * as dual from "#features/media/repo.dual.js";

const SOURCES = { exchange, dual, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.MEDIA_SOURCE ?? "")
  ? process.env.MEDIA_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const insertImage = impl.insertImage;
export const getImageById = impl.getImageById;
export const getTestImages = impl.getTestImages;
export const listImagesByUser = impl.listImagesByUser;
export const deleteImage = impl.deleteImage;
