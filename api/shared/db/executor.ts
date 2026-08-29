// The optional transaction handle every repo call takes as its last argument.
//
// WHY IT HAS A HOME. This one line was declared, byte-identical, in 37 repo
// files (D178) - every one of them importing PoolClient from pg purely to say
// it. A type spelled thirty-seven times is not thirty-seven types; it is one
// type with no address, and a reader has no way to tell which of the copies is
// the real one. Now there is exactly one.
//
// WHY `undefined` IS PART OF THE TYPE RATHER THAN THE PARAMETER. A repo call
// signs as `executor?: Executor`, and the optionality is doubled on purpose:
// callers both omit the argument and forward one they were handed, which may
// itself be undefined. `withTransaction` hands down a real client; a call
// outside a transaction hands down nothing and runs on the pool. Widening at
// the type rather than at each call site is what lets `f(a, executor)` compile
// in a function that does not know whether it is inside a transaction.
//
// WHY NOT IN @dorado/contracts. Contracts describe the wire - shapes that cross
// the API boundary and are generated from the database. A PoolClient never
// leaves this process and never appears in a response. It is plumbing, and it
// lives with the plumbing: query.d.ts and withTransaction.d.ts are its
// neighbours because they are the two functions that consume it.
import type { PoolClient } from "pg";

export type Executor = PoolClient | undefined;
