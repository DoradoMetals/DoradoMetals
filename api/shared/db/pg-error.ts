import { Invalid } from "#shared/errors.ts";

const MISSING_KEY = /^Key \(([^)]+)\)=.* is not present in table/;

type PgError = { code?: unknown; detail?: unknown };

function namedColumns(detail: string): string | null {
  const match = MISSING_KEY.exec(detail);
  if (!match) return null;
  const columns = match[1].split(",").map((c) => c.trim()).filter(Boolean);
  const theirs = columns.length > 1 ? columns.filter((c) => c !== "user_id") : columns;
  return theirs.length ? theirs.join(", ") : null;
}

export function asDomainError(err: unknown): unknown {
  const pg = (err ?? {}) as PgError;
  if (pg.code !== "23503" || typeof pg.detail !== "string") return err;
  const columns = namedColumns(pg.detail);
  return columns ? new Invalid(`${columns}: no such row`) : err;
}
