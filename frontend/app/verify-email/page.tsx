'use client';

import VerifyEmail from './_src_/ui/VerifyEmail'
import { Suspense } from 'react'

// This page is reached from the account-creation / verification email. The
// token in the URL is the credential, so it must be publicly accessible — a
// brand-new, unverified user has no session yet. Gating it behind
// ProtectedPage bounced them to /authentication before the token could be
// verified, leaving the account unverified and unable to log in.
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <main>
        <VerifyEmail />
      </main>
    </Suspense>
  )
}
