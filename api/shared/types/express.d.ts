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
    }
  }
}

export {};
