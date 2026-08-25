import minio from '#features/media/client.js';
import * as mediaRepo from "#features/media/repo.js";

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

export async function uploadImage({ mimeType, size, path, filename, user_id }) {
  const row = await mediaRepo.insertImage({
    user_id,
    bucket: process.env.MINIO_BUCKET,
    path,
    filename,
    mime_type: mimeType,
    size_bytes: size,
  });

  const uploadUrl = await minio.presignedPutObject(
    process.env.MINIO_BUCKET,
    path + filename,
    PUT_TTL_SECONDS
  );

  return {
    id: row.id,
    uploadUrl,
  };
}

// The image, if it is this caller's. Returns null rather than throwing so the
// controller decides the status; an image that does not exist and an image that
// is not yours are the same answer to somebody who should not know the
// difference.
async function ownedBy(image_id, user_id) {
  const img = await mediaRepo.getImageById(image_id);
  if (!img) return null;
  if (!user_id || img.user_id !== user_id) return null;
  return img;
}

// The internal presigner, used by getTestImages to attach a URL to rows it has
// already decided the caller may see. NOT reachable from a route: the guarded
// entry point is getUrlFor below.
export async function getUrl({ image_id }) {
  const img = await mediaRepo.getImageById(image_id);
  return await minio.presignedGetObject(
    img.bucket,
    img.path + img.filename,
    GET_TTL_SECONDS
  );
}

// What the route calls. A presigned GET URL is a download link for the object,
// so handing one out for an image id nobody checked is handing out the file:
// this took an image_id from the query string behind requireUser and asked
// nothing about whose it was.
export async function getUrlFor({ image_id, user_id }) {
  const img = await ownedBy(image_id, user_id);
  if (!img) return null;
  return await minio.presignedGetObject(
    img.bucket,
    img.path + img.filename,
    GET_TTL_SECONDS
  );
}

export async function attachUrlToImage(image) {
  const url = await getUrl({ image_id: image.id });
  return { ...image, url };
}

export async function getTestImages() {
  const images = await mediaRepo.getTestImages();
  return Promise.all(images.map((img) => attachUrlToImage(img)));
}

// DELETING AN IMAGE, IN THE ORDER THAT MATTERS.
//
// This used to read the image by id with no ownership check, remove the object
// from storage unconditionally, and only then run a DELETE that IS scoped to the
// user. So a signed-in caller posting somebody else's image id destroyed the
// real file and left the row behind pointing at nothing - and got
// { success: true } for it. Two things were wrong at once:
//
//   the ownership check was in the DELETE, which ran last and matched nothing,
//   and the irreversible step ran first, before anything had been authorised.
//
// features/media/repo.next.test.js has "deleteImage will not delete another
// user's image", and it passes - it tests the REPO, whose DELETE is correctly
// scoped. The bug was in the service above it. A test can prove the right thing
// about the wrong layer and read as coverage.
//
// Now: establish ownership, do the database work, and only then touch the
// outside world - which is what CLAUDE.md says and the reason it says it. If
// the object removal fails the row is already gone and the file is orphaned,
// which a sweep can find; the other order leaves a live row pointing at a file
// that no longer exists.
export async function deleteImage({ user_id, id }) {
  const img = await ownedBy(id, user_id);
  if (!img) return null;

  await mediaRepo.deleteImage(user_id, id);
  await minio.removeObject(img.bucket, img.path + img.filename);

  return { success: true };
}
