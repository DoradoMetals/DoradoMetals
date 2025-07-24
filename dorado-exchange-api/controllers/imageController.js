const imageService = require("../services/imageService");

async function uploadImage(req, res, next) {
  try {
    const result = await imageService.uploadImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getUrl(req, res, next) {
  try {
    const result = await imageService.getUrl(req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getTestImages(req, res, next) {
  try {
    const result = await imageService.getTestImages(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}


async function deleteImage(req, res, next) {
  try {
    const result = await imageService.deleteImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  uploadImage,
  getUrl,
  getTestImages,
  deleteImage
};
