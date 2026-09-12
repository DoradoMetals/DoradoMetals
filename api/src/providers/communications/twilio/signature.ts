import crypto from 'node:crypto'

// Twilio's documented scheme: the full request URL, then every POST parameter
// sorted by name with its value appended, HMAC-SHA1 with the auth token.
export function payload(url: string, params: Record<string, string>): string {
  let signed = url
  for (const name of Object.keys(params).sort()) signed += name + params[name]
  return signed
}

export function sign(url: string, params: Record<string, string>, authToken: string): string {
  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(payload(url, params), 'utf8'))
    .digest('base64')
}

export function verify(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  if (!signature) return false
  const expected = Buffer.from(sign(url, params, authToken), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  if (expected.length !== given.length) return false
  return crypto.timingSafeEqual(expected, given)
}
