import axios from 'axios';
import { requiredEnv } from '#shared/env/required.ts';

// The score a v3 token must beat. Not `parseFloat(x || '0.5')` any more — that only defaults for UNSET; a present-but-unreadable value fails silently two ways: "high" -> NaN (every comparison false, every human refused, no reason logged) or "0,7" -> 0 (parseFloat stops at the comma, threshold becomes zero, captcha effectively OFF).
// The second case is the one that matters — a locked-out sign-in gets reported within the hour; a captcha that passes everything looks exactly like one that works.
// So: parse the WHOLE string or reject it (Number() refuses "0,7" but reads ""/" " as 0, hence trim-and-reject-empty first), and reject anything outside 0..1 (v3 scores only ever fall there). Falls back rather than throwing — locking out the site is worse than ignoring a typo — but warns first, naming the variable, never its value.
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
