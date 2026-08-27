// Types for the session mock. See pinned-pool.d.ts for why these exist.
//
// KEPT IN STEP WITH session.js BY HAND, which is the standing risk of a
// declaration file: it can omit an export and nothing notices until a
// TypeScript caller reaches for it. `anonymous` was missing from the first
// version of this file and was found the moment a .ts test used it. If you add
// an export to session.js, add it here.
export function mockSessions(): Promise<void>;
export function restoreSessions(): void;

/** Runs `fn` with the session resolving to `user`; null means signed out. */
export function as<T>(
  user: { id: string; name?: string; email?: string; role?: string } | null,
  fn: () => Promise<T>
): Promise<T>;

/** Runs `fn` with no session at all. */
export function anonymous<T>(fn: () => Promise<T>): Promise<T>;
