import { fromNodeHeaders } from 'better-auth/node';

import { asyncHandler } from '#shared/middleware/asyncHandler.ts';
import { auth } from '#domain/auth/client.ts';

// Sets a password for the currently-authenticated user, used by the magic-link welcome flow — admin-created/order accounts start passwordless, and setPassword rejects users who already have one, so this only works exactly once.
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
