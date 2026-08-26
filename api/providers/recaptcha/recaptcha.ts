import axios from 'axios';
import { requiredEnv } from '#shared/env/required.ts';

// The score a v3 token must beat, from RECAPTCHA_THRESHOLD.
//
// WHY THIS IS NOT `parseFloat(x || '0.5')` ANY MORE. That expression reads as
// though it has a default, and it does - but only for UNSET. A value that is
// present and unreadable fails in one of two ways, and BOTH are silent:
//
//   "high"  parseFloat -> NaN, and every comparison against NaN is false, so
//           every human is refused. The API answers an ordinary `false` and
//           nothing says why.
//   "0,7"   parseFloat -> 0. It stops at the comma and keeps the 0. That is
//           NOT NaN, so no fallback of any kind fires, and the threshold
//           becomes zero - which every score clears. The captcha is off.
//
// The second is the one worth the trouble. A locked-out sign-in gets reported
// within the hour; a captcha that passes everything looks exactly like a
// captcha that works.
//
// So: parse the WHOLE string or reject it. Number() refuses "0,7", but reads
// "" and " " as 0, hence the trim-and-reject-empty first. A threshold outside
// 0..1 is rejected too - v3 scores only ever fall in that range, so a 5 refuses
// everybody and a -1 accepts everybody, and neither is a policy anyone chose.
//
// Unreadable falls back rather than throwing, because locking the site out is a
// worse answer to a typo than ignoring it - but it says so first, naming the
// variable and never printing what it holds.
export function scoreThreshold(): number {
  const raw = process.env.RECAPTCHA_THRESHOLD;
  if (raw === undefined) return DEFAULT_THRESHOLD;

  const trimmed = raw.trim();
  const parsed = trimmed === "" ? Number.NaN : Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn(
      `RECAPTCHA_THRESHOLD is set but is not a number between 0 and 1 - falling ` +
        `back to ${DEFAULT_THRESHOLD}. Left as it is, this would either refuse ` +
        `every sign-in or accept every one of them, without saying so.`
    );
    return DEFAULT_THRESHOLD;
  }
  return parsed;
}

const DEFAULT_THRESHOLD = 0.5;

export async function verifyToken(token: string): Promise<unknown> {
  if (!token) {
    throw new Error('Captcha token is missing');
  }

  const params = new URLSearchParams();
  params.append('secret', requiredEnv('RECAPTCHA_SECRET_KEY'));
  params.append('response', token);

  const threshold = scoreThreshold();

  const response = await axios.post(
    'https://www.google.com/recaptcha/api/siteverify',
    params
  );
  const { success, score } = response.data;

  return success && (score ?? 0) >= threshold;
}
