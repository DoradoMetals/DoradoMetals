// Answering a guarded request without committing anything. Every interesting endpoint resolves a session through better-auth, which builds its OWN Pool — invisible to pinned-pool.ts's transaction, so a session would have to be really committed for a guarded route to answer otherwise.
// The seam is the SESSION SOURCE, not the middleware — stubbing authMiddleware would make every request succeed and stop proving anything about who's allowed; replacing what auth.api.getSession returns leaves requireAuth, the role ladder and every 401/403 exactly as they are.
// Does NOT test that a real cookie resolves to a real session (that's better-auth's job, proven separately by endpoints.test.ts against the real thing) — patches one property rather than mocking the module, since authMiddleware calls auth.api.getSession(...) per request at call time.
import { auth } from "#domain/auth/client.ts";

// The session shape the middleware reads. Deliberately minimal: this is what
// the tests SAY a caller is, not better-auth's full session.
type TestUser = {
  id: string; role?: string | null; email?: string | null; name?: string | null;
  session_id?: string;
  // Anything else a service reads off the session user - dorado_funds is the
  // live example (pricing reads it for credit application). Spread through
  // below rather than enumerated, so a test can be any user a service expects.
  [extra: string]: unknown;
};
type TestSession = {
  user: { id: string; role: string; email: string | null; name: string | null };
  session: { id: string; userId: string };
} | null;

let current: TestSession = null;
let real: ((...args: unknown[]) => unknown) | null = null;

export async function mockSessions() {
  if (real) return;
  real = auth.api.getSession.bind(auth.api) as (...args: unknown[]) => unknown;
  // better-auth returns null for a caller with no session and requireAuth turns
  // that into a 401, so defaulting to null is what keeps a request that did not
  // ask to be somebody anonymous rather than accidentally privileged.
  (auth.api as Record<string, unknown>).getSession = async () => current;
}

// Puts the real one back, for a process that goes on to do something else.
export function restoreSessions() {
  if (!real) return;
  (auth.api as Record<string, unknown>).getSession = real;
  real = null;
}

// Everything inside fn runs as this user. Restored afterwards even on a throw,
// so one test cannot leak its identity into the next.
export async function as<T>(user: TestUser | null, fn: () => Promise<T> | T): Promise<T> {
  const previous = current;
  current = user
    ? {
        user: { ...user, id: user.id, role: user.role ?? "user", email: user.email ?? null, name: user.name ?? null },
        session: { id: user.session_id ?? "00000000-0000-0000-0000-000000000000", userId: user.id },
      }
    : null;
  try {
    return await fn();
  } finally {
    current = previous;
  }
}

export const anonymous = <T>(fn: () => Promise<T> | T): Promise<T> => as(null, fn);
