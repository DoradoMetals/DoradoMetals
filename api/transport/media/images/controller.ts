import { MediaUploadBody, MediaDeleteBody } from "@dorado/contracts";
import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as mediaService from "#domain/media/images/service.ts"

export const uploadImage = asyncHandler(async (req, res) => {
  const body = parseStrict(MediaUploadBody.strict(), req.body, "media/images/upload body");
  const result = await mediaService.uploadImage({
    mime_type: body.mime_type,
    size_bytes: body.size_bytes,
    filename: body.filename,
    user_id: callerId(req),
  });
  return res.status(200).json(result);
});

export const getUrl = asyncHandler(async (req, res) => {
  // The id is the caller's to name; whose image it is, is not - getUrlFor returns null either way, since "does not exist" and "is not yours" are deliberately the same answer.
  const result = await mediaService.getUrlFor({
    image_id: requiredParam(req.query.image_id, "image_id"),
    user_id: callerId(req),
  });
  if (!result) return res.status(404).json({ error: "Not Found" });
  return res.status(200).json(result);
});

export const getTestImages = asyncHandler(async (req, res) => {
  // getTestImages takes no arguments; req.body is unused here, not a filter.
  const result = await mediaService.getTestImages();
  return res.status(200).json(result);
});

export const deleteImage = asyncHandler(async (req, res) => {
  // user_id from the session, not the body - the body's user_id was only ever used in the scoped DELETE, which used to run after the file was already removed.
  const body = parseStrict(MediaDeleteBody.strict(), req.body, "media/images/delete body");
  const result = await mediaService.deleteImage({
    id: body.id,
    user_id: callerId(req),
  });
  if (!result) return res.status(404).json({ error: "Not Found" });
  return res.status(200).json(result);
});
