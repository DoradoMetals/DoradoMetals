// WHAT THE IMAGE SURFACE REFUSES (ruling 65). Pure - no database, no storage.
//
// A plain Error rather than NotFound on purpose: `getUrl` is the INTERNAL
// presigner (getTestImages), not reachable from a route, and every route-facing
// read answers null so that "not there" and "not yours" are indistinguishable.
// So a miss here is a caller inside this API naming an id it should already
// hold - a fault, which reaches the caller as 500 with the real message logged.
export function assertImage<T>(
  row: T | null | undefined, image_id: string
): asserts row is T {
  if (!row) throw new Error(`no image ${image_id}`);
}
