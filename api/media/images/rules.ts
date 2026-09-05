export function assertImage<T>(
  row: T | null | undefined, image_id: string
): asserts row is T {
  if (!row) throw new Error(`no image ${image_id}`);
}
