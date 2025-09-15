import minio from '../minio.js';
import * as imageRepo from '../repositories/imageRepo.js';

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

export async function uploadImage({ mimeType, size, path, filename, user_id }) {
  const row = await imageRepo.insertImage({
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

export async function getUrl({ image_id }) {
  const img = await imageRepo.getImageById(image_id);
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
  const images = await imageRepo.getTestImages();
  return Promise.all(images.map((img) => attachUrlToImage(img)));
}

export async function deleteImage({ user_id, id }) {
  const img = await imageRepo.getImageById(id);

  await minio.removeObject(img?.bucket, img?.path + img?.filename);
  await imageRepo.deleteImage(user_id, id);

  return { success: true };
}
