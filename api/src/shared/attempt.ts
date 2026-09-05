import { logger } from '#shared/logging/logger.ts'

export async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    logger.error({ err, what }, `${what} failed`)
    return undefined
  }
}
