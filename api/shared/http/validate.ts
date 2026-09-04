import type { Request } from "express";
import { z, type ZodType } from "zod/v4";
import { refuseWith } from "#shared/http/refuse.ts";
import { param } from "#shared/http/caller.ts";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uuidLike = z.string().regex(UUID_RE, "must be a uuid");

function strictParse<T>(schema: ZodType<T>, value: unknown, subject?: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue?.path?.join(".") ?? "";
  const detail = path ? `"${path}" ${issue!.message}` : (issue?.message ?? "is invalid");
  return refuseWith(400, subject ? `${subject}: ${detail}` : detail);
}

export function parseStrict<T>(schema: ZodType<T>, value: unknown, subject: string): T {
  return strictParse(schema, value, subject);
}

export function strictBody<T>(schema: ZodType<T>, body: unknown): T {
  return strictParse(schema, body ?? {});
}

export function uuidParam(req: { params: Record<string, unknown> }, name: string): string {
  const raw = param(req as Request, name);
  if (!UUID_RE.test(raw)) refuseWith(400, `"${name}" must be a uuid`);
  return raw;
}

export function uuidField(body: Record<string, unknown> | undefined, name: string): string {
  const raw = body?.[name];
  if (typeof raw !== "string" || !UUID_RE.test(raw)) refuseWith(400, `"${name}" must be a uuid`);
  return raw;
}
