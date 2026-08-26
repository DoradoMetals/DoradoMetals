import { fromNodeHeaders } from 'better-auth/node';

import { asyncHandler } from '#shared/middleware/asyncHandler.js';
import { auth } from '#features/auth/client.js';

// Sets a password for the currently-authenticated user. Used by the magic-link
// welcome flow (/verify-login): admin-created / order accounts are created
// passwordless, so after the magic link signs them in they have no credential
// password and better-auth's setPassword can create one. (This is why the
// account must be passwordless — setPassword rejects users who already have a
// password.)
export const setPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body ?? {};

  if (!newPassword || typeof newPassword !== 'string') {
    return res
      .status(400)
      .json({ error: 'Bad Request', message: 'newPassword is required' });
  }

  await auth.api.setPassword({
    body: { newPassword },
    headers: fromNodeHeaders(req.headers),
  });

  return res.status(200).json({ success: true });
});
