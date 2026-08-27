import minio from "#providers/s3/minio.ts";
import * as mediaRepo from "#features/media/repo.js";
import type { ImageRow } from "#features/media/repo.next.ts";

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

// Returns the new id and a presigned PUT url - not the row. The client uploads
// straight to storage with that url; the API never sees the bytes.
export async function uploadImage({
  mimeType,
  size,
  path,
  filename,
  user_id,
}: {
  mimeType?: string | null;
  size?: number | null;
  path: string;
  filename: string;
  user_id: string;
}): Promise<{ id: string; uploadUrl: string }> {
  // Read at CALL time, not module level - a module-level const reading
  // process.env is evaluated before any script that sets it.
  //
  // NOT VALIDATED AT BOOT. env.js checks DATABASE_URL and TEST_DATABASE_URL and
  // nothing else, and these are MINIO_BUCKET's only two uses in the repo. Unset,
  // the insert writes a null bucket and the presign below is handed undefined,
  // so an upload fails confusingly at request time rather than clearly at
  // startup. Asserted rather than defaulted because there is no sensible default
  // for a bucket name; recorded in FOLLOWUPS.md rather than fixed here, since
  // adding a boot check is a deploy-time behaviour change.
  const bucket = process.env.MINIO_BUCKET as string;

  const row = await mediaRepo.insertImage({
    user_id,
    bucket,
    path,
    filename,
    mime_type: mimeType,
    size_bytes: size,
  });

  const uploadUrl = await minio.presignedPutObject(
    bucket,
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
async function ownedBy(
  image_id: string,
  user_id?: string
): Promise<ImageRow | null> {
  const img = await mediaRepo.getImageById(image_id);
  if (!img) return null;
  if (!user_id || img.user_id !== user_id) return null;
  return img;
}

// The internal presigner, used by getTestImages to attach a URL to rows it has
// already decided the caller may see. NOT reachable from a route: the guarded
// entry point is getUrlFor below.
export async function getUrl({ image_id }: { image_id: string }): Promise<string> {
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
export async function getUrlFor({
  image_id,
  user_id,
}: {
  image_id: string;
  user_id?: string;
}): Promise<string | null> {
  const img = await ownedBy(image_id, user_id);
  if (!img) return null;
  return await minio.presignedGetObject(
    img.bucket,
    img.path + img.filename,
    GET_TTL_SECONDS
  );
}

export async function attachUrlToImage(image: ImageRow): Promise<ImageRow & { url: string }> {
  const url = await getUrl({ image_id: image.id });
  return { ...image, url };
}

export async function getTestImages(): Promise<(ImageRow & { url: string })[]> {
  const images = await mediaRepo.getTestImages();
  return Promise.all(images.map((img: ImageRow) => attachUrlToImage(img)));
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
// Returns null for "not yours" AND for "does not exist", deliberately -
// telling them apart would confirm somebody else's image id is real.
export async function deleteImage({
  user_id,
  id,
}: {
  user_id?: string;
  id: string;
}): Promise<{ success: true } | null> {
  const img = await ownedBy(id, user_id);
  if (!img) return null;

  await mediaRepo.deleteImage(user_id, id);
  await minio.removeObject(img.bucket, img.path + img.filename);

  return { success: true };
}
