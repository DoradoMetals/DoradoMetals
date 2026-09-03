// What requireUser puts on the request, and nothing else does — better-auth's session user plus the columns client.ts declares as additionalFields (role for requireAdmin, dorado_funds for pricing store credit).
// Optional on purpose — Express hands the same Request type to every handler whether guarded or not, so reading req.user.id is a compile error when the guard is absent, not a production TypeError.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name?: string | null;
        email?: string | null;
        role?: string | null;
        dorado_funds?: number | null;
        stripeCustomerId?: string | null;
      };
      // The SESSION's own id, set by the same guard. payments keys its
      // reusable intent on (session_id, user_id, type), and reading it here
      // is what lets the domain take ids rather than raw request headers and
      // run a second getSession of its own (D214 item 11).
      sessionId?: string;
    }
  }
}

export {};
