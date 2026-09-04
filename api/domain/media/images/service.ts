// Media: orchestration and everything that touches storage. Reads come from media.images; the object store is reached through providers/s3 - this file decides WHICH bytes and WHOSE, the provider decides how they get there.
import { randomUUID } from "node:crypto";
import minio from "#providers/s3/minio.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as images from "#db/media/images/repo.ts";
import type { NewImage } from "#db/media/images/repo.ts";
import * as rules from "#domain/media/images/rules.ts";
import type { Image } from "@dorado/contracts";

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

// Returns the new id and a presigned PUT url - not the row. The client uploads
// straight to storage with that url; the API never sees the bytes.
// `path` is not an argument any more (was accepted and silently ignored): the
// key is entirely server-chosen (see the comment below), so a caller's path
// never did anything.
export async function uploadImage({
  mime_type, size_bytes, filename, user_id,
}: {
  mime_type?: string | null;
  size_bytes?: number | null;
  filename: string;
  user_id: string;
}): Promise<{ id: string; uploadUrl: string }> {
  // Read at CALL time, not module level - a module-level const would evaluate before any script sets the env var. Unset, this writes a null bucket; tracked in FOLLOWUPS.md rather than fixed here (a boot check is a deploy-time change).
  const bucket = process.env.MINIO_BUCKET as string;

  // The server names the object: path/filename used to come from the request body, so a caller could aim a presigned write at ANY key in the bucket, including someone else's. The key is now user-scoped and uuid-prefixed; the client's filename survives only as a sanitised suffix, and the client's path is ignored entirely.
  // The upsert on (path, filename, user_id) still stands in the SQL but can no longer fire - every upload is a fresh key by construction.
  const originalName = String(filename ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(-80) || "upload";
  const image: NewImage = {
    user_id,
    bucket,
    path: `${user_id}/`,
    filename: `${randomUUID()}-${originalName}`,
    mime_type,
    size_bytes,
  };

  // create is an upsert on (path, filename, user_id) - a retried upload returns the id of the row that ALREADY existed rather than the one generated here; callers must use the returned id.
  const row = await withTransaction(async (client) => {
    const written = await images.create(randomUUID(), image, client);
    return written;
  });

  // Outside the transaction: presigning is a network call, and nothing irreversible belongs inside one that may roll back.
  const uploadUrl = await minio.presignedPutObject(
    bucket, image.path + image.filename, PUT_TTL_SECONDS
  );

  return { id: row.id, uploadUrl };
}

// Returns null rather than throwing so the controller decides the status - a missing image and someone else's image must answer the same, so as not to leak which.
async function ownedBy(image_id: string, user_id?: string): Promise<Image | null> {
  const img = await images.getOne(image_id);
  if (!img) return null;
  if (!user_id || img.user_id !== user_id) return null;
  return img;
}

const presign = (img: Image) =>
  minio.presignedGetObject(img.bucket, img.path + img.filename, GET_TTL_SECONDS);

// Internal presigner for getTestImages, attaching a URL to rows it already decided the caller may see - NOT reachable from a route (the guarded entry point is getUrlFor below).
export async function getUrl({ image_id }: { image_id: string }): Promise<string> {
  const img = await images.getOne(image_id);
  rules.assertImage(img, image_id);
  return await presign(img);
}

// What the route calls - a presigned GET URL is a download link, so handing one out for an unchecked id hands out the file.
export async function getUrlFor({
  image_id, user_id,
}: { image_id: string; user_id?: string }): Promise<string | null> {
  const img = await ownedBy(image_id, user_id);
  if (!img) return null;
  return await presign(img);
}

export async function attachUrlToImage(image: Image): Promise<Image & { url: string }> {
  const url = await presign(image);
  return {
    id: image.id,
    bucket: image.bucket,
    mime_type: image.mime_type,
    size_bytes: image.size_bytes,
    width: image.width,
    height: image.height,
    checksum: image.checksum,
    metadata: image.metadata,
    path: image.path,
    filename: image.filename,
    user_id: image.user_id,
    created_at: image.created_at,
    url,
  };
}

export async function getTestImages(): Promise<(Image & { url: string })[]> {
  const rows = await images.list();
  return Promise.all(rows.map(attachUrlToImage));
}

export async function listForUser(user_id: string): Promise<Image[]> {
  return await images.listFor(user_id);
}

// Deleting an image, order matters: ownership is established, then the database write, then the outside world (object removal) - never the reverse. The old order removed the object first and could destroy a real file with the row left behind, reporting success.
// If the object removal fails now, the row is already gone and the file is orphaned (a sweep can find that); the reverse order leaves a live row pointing at nothing.
// Returns null for "not yours" AND "does not exist", deliberately - telling them apart would confirm somebody else's image id is real.
export async function deleteImage({
  user_id, id,
}: { user_id?: string; id: string }): Promise<{ success: true } | null> {
  const img = await ownedBy(id, user_id);
  if (!img) return null;

  await withTransaction(async (client) => {
    await images.remove(id, user_id as string, client);
  });

  // Outside the transaction, and last - removing an object cannot be rolled back.
  await minio.removeObject(img.bucket, img.path + img.filename);

  return { success: true };
}
