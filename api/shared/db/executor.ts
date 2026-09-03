// The optional transaction handle every repo call takes as its last argument. Was declared byte-identical in 37 repo files — one type with no address, now consolidated to one.
// `undefined` is part of the TYPE rather than the parameter because callers both omit the argument and forward one they were handed (which may itself be undefined) — widening at the type is what lets `f(a, executor)` compile without the function knowing whether it's inside a transaction.
// Not in @dorado/contracts — a PoolClient never crosses the API boundary; it's plumbing, living beside query.ts and withTransaction.ts, its only consumers.
import type { PoolClient } from "pg";

export type Executor = PoolClient | undefined;
