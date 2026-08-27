// Media: orchestration, the dual write, and everything that touches storage.
//
// Reads come from media.images; writes go to both schemas. The object store is
// reached through providers/s3 - this file decides WHICH bytes and WHOSE, the
// provider decides how they get there.
import { randomUUID } from "node:crypto";
import minio from "#providers/s3/minio.ts";
import withTransaction from "#shared/db/withTransaction.js";
import * as images from "#features/media/repo.ts";
import * as legacy from "#features/media/legacy.repo.ts";
import type { ImageRow, NewImage } from "#features/media/repo.ts";

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

// Returns the new id and a presigned PUT url - not the row. The client uploads
// straight to storage with that url; the API never sees the bytes.
export async function uploadImage({
  mimeType, size, path, filename, user_id,
}: {
  mimeType?: string | null;
  size?: number | null;
  path: string;
  filename: string;
  user_id: string;
}): Promise<{ id: string; uploadUrl: string }> {
  // Read at CALL time, not module level - a module-level const reading
  // process.env is evaluated before any script that sets it. Unset, the insert
  // writes a null bucket and the presign is handed undefined; recorded in
  // FOLLOWUPS.md rather than fixed here, since a boot check is a deploy-time
  // behaviour change.
  const bucket = process.env.MINIO_BUCKET as string;
  const image: NewImage = {
    user_id, bucket, path, filename, mime_type: mimeType, size_bytes: size,
  };

  // THE ID COMES BACK FROM THE NEW SCHEMA, and the legacy write uses it.
  //
  // create is an upsert on (path, filename, user_id), so a retried upload of
  // the same object returns the id of the row that ALREADY existed rather than
  // the one generated here. Using the returned id is what lets both schemas
  // agree on a primary key without reading exchange back - which is the
  // dependency this restructure exists to remove.
  const row = await withTransaction(async (client) => {
    const written = await images.create(randomUUID(), image, client);
    await legacy.create(written.id, image, client);
    return written;
  });

  // OUTSIDE THE TRANSACTION. Presigning is a network call to storage, and
  // nothing irreversible belongs inside a transaction that may roll back.
  const uploadUrl = await minio.presignedPutObject(
    bucket, path + filename, PUT_TTL_SECONDS
  );

  return { id: row.id, uploadUrl };
}

// The image, if it is this caller's. Returns null rather than throwing so the
// controller decides the status; an image that does not exist and an image that
// is not yours are the same answer to somebody who should not know the
// difference.
async function ownedBy(image_id: string, user_id?: string): Promise<ImageRow | null> {
  const img = await images.getOne(image_id);
  if (!img) return null;
  if (!user_id || img.user_id !== user_id) return null;
  return img;
}

const presign = (img: ImageRow) =>
  minio.presignedGetObject(img.bucket, img.path + img.filename, GET_TTL_SECONDS);

// The internal presigner, used by getTestImages to attach a URL to rows it has
// already decided the caller may see. NOT reachable from a route: the guarded
// entry point is getUrlFor below.
export async function getUrl({ image_id }: { image_id: string }): Promise<string> {
  const img = await images.getOne(image_id);
  if (!img) throw new Error(`no image ${image_id}`);
  return await presign(img);
}

// What the route calls. A presigned GET URL is a download link for the object,
// so handing one out for an image id nobody checked is handing out the file.
export async function getUrlFor({
  image_id, user_id,
}: { image_id: string; user_id?: string }): Promise<string | null> {
  const img = await ownedBy(image_id, user_id);
  if (!img) return null;
  return await presign(img);
}

export async function attachUrlToImage(image: ImageRow): Promise<ImageRow & { url: string }> {
  return { ...image, url: await presign(image) };
}

export async function getTestImages(): Promise<(ImageRow & { url: string })[]> {
  const rows = await images.getAll();
  return Promise.all(rows.map(attachUrlToImage));
}

export async function listForUser(user_id: string): Promise<ImageRow[]> {
  return await images.byUser(user_id);
}

// DELETING AN IMAGE, IN THE ORDER THAT MATTERS.
//
// This used to read the image by id with no ownership check, remove the object
// from storage unconditionally, and only then run a DELETE that IS scoped to
// the user. So a signed-in caller posting somebody else's image id destroyed
// the real file and left the row behind - and got { success: true } for it.
//
// Now: establish ownership, do the database work, and only then touch the
// outside world. If the object removal fails the row is already gone and the
// file is orphaned, which a sweep can find; the other order leaves a live row
// pointing at a file that no longer exists.
//
// Returns null for "not yours" AND for "does not exist", deliberately - telling
// them apart would confirm somebody else's image id is real.
export async function deleteImage({
  user_id, id,
}: { user_id?: string; id: string }): Promise<{ success: true } | null> {
  const img = await ownedBy(id, user_id);
  if (!img) return null;

  await withTransaction(async (client) => {
    await images.remove(user_id as string, id, client);
    await legacy.remove(user_id as string, id, client);
  });

  // OUTSIDE the transaction, and last. Removing an object cannot be rolled back.
  await minio.removeObject(img.bucket, img.path + img.filename);

  return { success: true };
}
