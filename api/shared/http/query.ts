// One query-string value, or nothing.
//
// Express types `req.query.x` as `string | string[] | ParsedQs | ParsedQs[] |
// undefined`, and that is not pedantry - it is what actually arrives.
// `?id=a&id=b` gives an array and `?id[k]=v` gives an object, from any caller
// who feels like sending one.
//
// Handing either straight to a repo means pg receives an array or an object
// where a uuid was expected, and the result is a 500 on malformed input rather
// than a clean refusal - the same shape as the fulfillment refusals in
// 9a82a7ed, where the caller learned nothing and the reason went to the log.
//
// This narrows to the string case and answers `undefined` otherwise, so the
// handler decides what a missing parameter means. It does NOT coerce: an array
// is not silently joined into "a,b", because that would invent an id nobody
// sent.
export function oneString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
