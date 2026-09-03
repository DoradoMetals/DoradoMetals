// One query-string value, or nothing. Express types req.query.x as string | string[] | ParsedQs | ParsedQs[] | undefined, and that's what actually arrives (?id=a&id=b gives an array, ?id[k]=v gives an object) — handing either to a repo means a 500 on malformed input instead of a clean refusal.
// Narrows to the string case, answering undefined otherwise, so the handler decides what a missing parameter means. Does NOT coerce — an array isn't silently joined into "a,b", which would invent an id nobody sent.
export function oneString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
