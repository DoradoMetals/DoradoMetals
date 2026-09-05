import { z } from 'zod/v4';
import { fromNodeHeaders } from 'better-auth/node';

import { asyncHandler } from '#shared/middleware/asyncHandler.ts';
import { parseStrict } from '#shared/http/validate.ts';
import { auth } from '#identity/auth/client.ts';

const SetPasswordBody = z.object({ newPassword: z.string().min(1) }).strict();

export const setPassword = asyncHandler(async (req, res) => {
  const { newPassword } = parseStrict(SetPasswordBody, req.body, "auth/set_password body");

  await auth.api.setPassword({
    body: { newPassword },
    headers: fromNodeHeaders(req.headers),
  });

  return res.status(200).json({ success: true });
});
