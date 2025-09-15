import * as imageService from "../services/imageService.js";

export async function uploadImage(req, res, next) {
  try {
    const result = await imageService.uploadImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getUrl(req, res, next) {
  try {
    const result = await imageService.getUrl(req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getTestImages(req, res, next) {
  try {
    const result = await imageService.getTestImages(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}


export async function deleteImage(req, res, next) {
  try {
    const result = await imageService.deleteImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}