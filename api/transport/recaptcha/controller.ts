import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as recaptcha from "#providers/captcha/recaptcha.ts"

export const verifyRecaptcha = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Missing captcha token" });
  }
  const isHuman = await recaptcha.verifyToken(token);
  return res.json(isHuman);
});
