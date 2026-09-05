declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        name?: string | null
        email?: string | null
        role?: string | null
        dorado_funds?: number | null
        stripeCustomerId?: string | null
      }
      sessionId?: string
    }
  }
}

export {}
