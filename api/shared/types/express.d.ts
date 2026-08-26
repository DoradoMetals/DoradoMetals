// What requireUser puts on the request, and nothing else does.
//
// better-auth's session user, plus the columns features/auth/client.js declares
// as additionalFields - `role` is what requireAdmin reads, and `dorado_funds` is
// what prices an order against a customer's store credit.
//
// OPTIONAL ON PURPOSE. Express hands the same Request type to every handler,
// guarded or not, so a controller reading `req.user.id` has to say what it
// expects when the guard is absent. That is a compile error rather than a
// TypeError in production, which is where the equivalent service-layer holes
// were found.
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
