// Dual-write phase of the media schema migration.
//
// Writes go to exchange and are mirrored into media.images, both inside one
// transaction. Reads come from media so it is exercised by real traffic while
// exchange stays a complete replica.
//
// insertImage is an upsert on (path, filename, user_id), so re-uploading a file
// replaces the row rather than adding one. The mirror is keyed on the id
// exchange returns, which means a replace mirrors as a replace rather than
// leaving an orphan behind.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/media/repo.exchange.js";
import * as next from "#features/media/repo.next.js";

export const getImageById = next.getImageById;
export const getTestImages = next.getTestImages;
export const listImagesByUser = next.listImagesByUser;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export async function insertImage(image, executor) {
  return both(executor, async (c) => {
    const written = await exchange.insertImage(image, c);
    await next.mirrorImage(written.id, c);
    return written;
  });
}

export async function deleteImage(user_id, id, executor) {
  return both(executor, async (c) => {
    await exchange.deleteImage(user_id, id, c);
    await next.deleteImage(user_id, id, c);
  });
}
