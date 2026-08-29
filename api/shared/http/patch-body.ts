// The two halves of checking a PATCH document, stated once.
//
// Every PATCH on the D87 order surface answers the same two questions before
// it dispatches anything, and it has to answer them IN THIS ORDER:
//
//   1. is every field one this endpoint has?   -> refusedUnknownField
//   2. is every value one the field accepts?   -> refusedValue
//
// THE ORDER IS LOAD-BEARING. zod STRIPS unknown keys rather than rejecting
// them, so a document parsed first would turn a typo'd field into a silent
// 200 that wrote nothing - which is the admin-mutation-urls bug the whole
// consolidation was written to end. Refusing by name first means nothing
// unknown survives to reach the schema, and stripping becomes irrelevant.
//
// AND NEITHER OF THESE RETURNS DATA. The caller keeps dispatching off the
// ORIGINAL body, never `parsed.data`: a patch document distinguishes absent
// from null from a value, and handing the dispatch a rebuilt object is how
// that distinction gets lost (D182).
import type { ZodType } from "zod/v4";

export type Refusal = { statusCode: number; message: string };

// Every field the document names, checked against the closed set the endpoint
// declares. The set comes from the CONTRACT's own keys at the call site, so a
// field added to the contract and not to the service cannot happen.
export function refusedUnknownField(
  body: Record<string, unknown>,
  fields: readonly string[],
  subject: string,
  why?: (field: string) => string | null
): Refusal | null {
  const present = Object.keys(body ?? {});
  for (const field of present) {
    if (!fields.includes(field)) {
      const bespoke = why?.(field) ?? null;
      return {
        statusCode: 400,
        message: bespoke ?? `"${field}" is not a field of ${subject}`,
      };
    }
  }
  return null;
}

// The values, through the contract. Named by field, because "expected number,
// received null" with no field name is what an admin would have to guess at.
//
// The FIRST issue only: a patch document is small and a caller fixes one thing
// at a time, and the endpoints this replaces all answered with one message.
export function refusedValue(
  schema: ZodType<unknown>,
  body: unknown
): Refusal | null {
  const parsed = schema.safeParse(body);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const path = issue?.path?.join(".") ?? "";
  return {
    statusCode: 400,
    message: path
      ? `"${path}": ${issue!.message}`
      : (issue?.message ?? "the document is not a valid patch"),
  };
}
