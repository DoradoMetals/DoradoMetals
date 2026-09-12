import { isIP } from 'node:net'

export type IpSource = {
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string | null } | null
}

export function clientIp(req: IpSource): string | null {
  if (process.env.TRUST_CLOUDFLARE === '1') {
    const header = req.headers['cf-connecting-ip']
    if (typeof header === 'string') {
      const claimed = normalise(header)
      if (claimed) return claimed
    }
  }
  return normalise(req.socket?.remoteAddress ?? '')
}

function normalise(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  const unmapped =
    trimmed.startsWith('::ffff:') && isIP(trimmed.slice(7)) === 4 ? trimmed.slice(7) : trimmed
  return isIP(unmapped) === 0 ? null : unmapped
}
