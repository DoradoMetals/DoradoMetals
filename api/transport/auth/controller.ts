import { z } from 'zod/v4';
import { fromNodeHeaders } from 'better-auth/node';

import { asyncHandler } from '#shared/middleware/asyncHandler.ts';
import { parseStrict } from '#shared/http/validate.ts';
import { auth } from '#domain/auth/client.ts';

// No generated row backs this body - better-auth owns auth.account, not this
// feature - so the schema is declared here rather than derived from a table.
const SetPasswordBody = z.object({ newPassword: z.string().min(1) }).strict();

// Sets a password for the currently-authenticated user, used by the magic-link welcome flow — admin-created/order accounts start passwordless, and setPassword rejects users who already have one, so this only works exactly once.
export const setPassword = asyncHandler(async (req, res) => {
  const { newPassword } = parseStrict(SetPasswordBody, req.body, "auth/set_password body");

  await auth.api.setPassword({
    body: { newPassword },
    headers: fromNodeHeaders(req.headers),
  });

  return res.status(200).json({ success: true });
});
