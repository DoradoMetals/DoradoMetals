import { logger } from '#shared/logging/logger.ts'

export type Observed<T> = { ok: true; value: T } | { ok: false; message: string }

export async function observe<T>(what: string, fn: () => Promise<T>): Promise<Observed<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    logger.error({ err, what }, `${what} failed`)
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
