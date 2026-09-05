const SECRET_KEY =
  /(^|[._-])(routing|account)_?number$|^(ssn|tax_?id|iban|swift|password|token|secret|api_?key|authorization|cookie)$/i

function redact(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extra)) {
    out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : v
  }
  return out
}

export type ErrorReport = {
  at: string
  message: string
  err?: unknown
  extra?: Record<string, unknown>
}

export function reportError({ at, message, err, extra }: ErrorReport): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : undefined
    const context = extra && Object.keys(extra).length ? ` ${JSON.stringify(redact(extra))}` : ''
    console.error(`[${at}] ${message}${detail ? ` - ${detail}` : ''}${context}`)
    if (err instanceof Error && err.stack) console.error(err.stack)
  } catch {}
}
