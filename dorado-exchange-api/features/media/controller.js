import * as mediaService from "#features/media/service.js"

export async function uploadImage(req, res, next) {
  try {
    const result = await mediaService.uploadImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getUrl(req, res, next) {
  try {
    const result = await mediaService.getUrl(req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getTestImages(req, res, next) {
  try {
    const result = await mediaService.getTestImages(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}


export async function deleteImage(req, res, next) {
  try {
    const result = await mediaService.deleteImage(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}