export type ErrorKind = "not_found" | "forbidden" | "conflict" | "invalid";

export const STATUS_OF_KIND: Record<ErrorKind, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 422,
};

export class DomainError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = new.target.name;
  }
}

export class NotFound extends DomainError {
  constructor(message: string) {
    super("not_found", message);
  }
}

export class Forbidden extends DomainError {
  constructor(message: string) {
    super("forbidden", message);
  }
}

export class Conflict extends DomainError {
  constructor(message: string) {
    super("conflict", message);
  }
}

export class Invalid extends DomainError {
  constructor(message: string) {
    super("invalid", message);
  }
}

export function statusOfDomainError(err: unknown): number | null {
  return err instanceof DomainError ? STATUS_OF_KIND[err.kind] : null;
}
