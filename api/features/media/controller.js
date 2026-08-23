import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as mediaService from "#features/media/service.js"

export const uploadImage = asyncHandler(async (req, res) => {
  const result = await mediaService.uploadImage(req.body);
  return res.status(200).json(result);
});

export const getUrl = asyncHandler(async (req, res) => {
  const result = await mediaService.getUrl(req.query);
  return res.status(200).json(result);
});

export const getTestImages = asyncHandler(async (req, res) => {
  const result = await mediaService.getTestImages(req.body);
  return res.status(200).json(result);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const result = await mediaService.deleteImage(req.body);
  return res.status(200).json(result);
});
