const { minio } = require("../minio");
const imageRepo = require("../repositories/imageRepo");

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 10;

async function uploadImage({ mimeType, size, path, filename, user_id }) {
  const row = await imageRepo.insertImage({
    user_id: user_id,
    bucket: process.env.MINIO_BUCKET,
    path: path,
    filename: filename,
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

async function getUrl({ image_id }) {
  const img = await imageRepo.getImageById(image_id);
  return await minio.presignedGetObject(
    img.bucket,
    img.path + img.filename,
    GET_TTL_SECONDS
  );
}

async function attachUrlToImage(image) {
  const url = await getUrl({ image_id: image.id });
  return { ...image, url };
}

async function getTestImages() {
  const images = await imageRepo.getTestImages();

  const imagesWithUrls = await Promise.all(
    images.map((img) => attachUrlToImage(img))
  );
  return imagesWithUrls;
}

async function deleteImage({ user_id, id }) {
  const img = await imageRepo.getImageById(id);

  await minio.removeObject(img?.bucket, img?.path + img?.filename);
  await imageRepo.deleteImage(user_id, id);

  return { success: true };
}

module.exports = {
  uploadImage,
  getUrl,
  getTestImages,
  deleteImage,
};
