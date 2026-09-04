import type { Request } from "express";

export function callerId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - this endpoint needs a signed-in caller"
    );
    err.statusCode = 401;
    throw err;
  }
  return id;
}

export function param(req: { params: Record<string, unknown> }, name: string): string {
  return requiredParam(req.params[name], name);
}

export function requiredParam(value: unknown, name: string): string {
  const s = typeof value === "string" ? value : undefined;
  if (!s) {
    const err: Error & { statusCode?: number } = new Error(`${name} is required`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}
