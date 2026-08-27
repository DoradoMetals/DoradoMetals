// Types for the session mock. See pinned-pool.d.ts for why these exist.
export function mockSessions(): Promise<void>;
export function restoreSessions(): void;
export function as<T>(
  user: { id: string; name?: string; email?: string; role?: string },
  fn: () => Promise<T>
): Promise<T>;
