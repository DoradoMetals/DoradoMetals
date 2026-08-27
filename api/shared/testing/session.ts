// Answering a guarded request without committing anything.
//
// Every interesting endpoint is behind requireUser or requireAdmin, and both
// resolve a session through better-auth - which builds its OWN Pool in
// features/auth/client.js and therefore cannot see the transaction
// shared/testing/pinned-pool.js holds open. A session would have to be really
// committed for a guarded route to answer.
//
// THE SEAM IS THE SESSION SOURCE, NOT THE MIDDLEWARE. Stubbing
// authMiddleware.js would make every request succeed and the tests would stop
// saying anything about who is allowed to do what - a replay test that passes
// as an anonymous caller has proved nothing. Replacing what
// auth.api.getSession returns leaves requireAuth, the role ladder and every
// 401/403 exactly as they are, so an admin route asked for by a `user` still
// refuses.
//
// What this does NOT test is that a real cookie resolves to a real session.
// That is better-auth's job, and shared/http/endpoints.test.js already proves
// every guarded endpoint refuses an anonymous request against the real thing.
// The two files cover different halves on purpose.
//
// Done by patching one property rather than by mocking the module.
// authMiddleware.js imports the auth client once and calls
// `auth.api.getSession(...)` per request, so the lookup happens at call time
// and replacing the function is enough. node:test's mock.module would also
// work in principle and does not exist in this Node build - and it would have
// needed to run before #app was imported, which is a sharper edge than this
// needs.
import { auth } from "#features/auth/client.ts";

// The session shape the middleware reads. Deliberately minimal: this is what
// the tests SAY a caller is, not better-auth's full session.
type TestUser = {
  id: string; role?: string | null; email?: string | null; name?: string | null;
  session_id?: string;
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
        user: { id: user.id, role: user.role ?? "user", email: user.email ?? null, name: user.name ?? null },
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
