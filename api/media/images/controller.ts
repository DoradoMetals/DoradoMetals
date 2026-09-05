import { MediaUploadBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as mediaService from "#media/images/service.ts"

export const uploadImage = asyncHandler(async (req, res) => {
  const body = parseStrict(MediaUploadBody.strict(), req.body, "media/images upload body");
  const result = await mediaService.uploadImage(
    callerId(req), body.filename, body.mime_type ?? null, body.size_bytes ?? null
  );
  return res.status(201).json(result);
});

export const getUrl = asyncHandler(async (req, res) => {
  const result = await mediaService.getUrlFor(
    requiredParam(req.params.id, "id"), callerId(req)
  );
  if (!result) return res.status(404).json({ error: "Not Found" });
  return res.status(200).json(result);
});

export const getTestImages = asyncHandler(async (req, res) => {
  const result = await mediaService.getTestImages();
  return res.status(200).json(result);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const result = await mediaService.deleteImage(id, callerId(req));
  if (!result) return res.status(404).json({ error: "Not Found" });
  return res.status(200).json(result);
});
