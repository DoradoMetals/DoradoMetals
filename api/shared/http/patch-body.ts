import type { ZodType } from "zod/v4";

export type Refusal = { statusCode: number; message: string };

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
