import { logger } from "#shared/logging/logger.ts";

// An after-commit side effect that must not fail the request.
export async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    logger.error({ err, what }, `${what} failed`);
    return undefined;
  }
}
