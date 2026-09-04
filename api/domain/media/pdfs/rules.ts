// WHAT DOCUMENT RENDERING AND SERVING REFUSE (ruling 65). Pure - no database,
// no storage, no filesystem read of its own.
import { NotFound } from "#shared/errors.ts";

// A document is composed from an order, so an id that names none has nothing
// to render.
export function assertOrder<T>(
  order: T | null | undefined, order_id: string
): asserts order is T {
  if (!order) throw new NotFound(`no order ${order_id}`);
}

// The five SVGs and three fonts are inlined at module load so a rendered PDF
// depends on nothing external mid-render. No assets directory is a broken
// deployment, not a bad request - a plain Error, at import time, rather than
// every document silently losing its logo.
export function assertAssetsDir(
  dir: string | null, searchedFrom: string
): asserts dir is string {
  if (!dir) throw new Error(`no shared/assets directory above ${searchedFrom}`);
}

// The real object-storage reader refuses to exist during a test run, like the
// shared mail transport: a forgotten stub must not reach live MinIO. The
// caller's `attempt` turns this into a live render rather than a crash.
export function assertNotTestRun(isTest: boolean): void {
  if (isTest) {
    throw new Error(
      "refusing to read real object storage during a test run - pass a StoredReader"
    );
  }
}

// "One render, one truth": a stored object whose bytes no longer hash to what
// was recorded is not the document that was sent, so it is not served. The
// caller falls back to a live render.
export function assertChecksum(matches: boolean, checksum: string): void {
  if (!matches) throw new Error(`bytes do not match stored checksum ${checksum}`);
}
