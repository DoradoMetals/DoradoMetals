import axios from 'axios';
import { requiredEnv } from '#shared/env/required.ts';

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
