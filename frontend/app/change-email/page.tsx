'use client';

import { Suspense } from 'react'
import ChangeEmail from './_src_/ui/ChangeEmailSucess'

// Reached from the email-change confirmation link. The signed token in the URL
// is the credential, so this must be public — gating it behind ProtectedPage
// bounced users to /authentication whenever the link was opened without an
// active session (e.g. a different browser/device), so the change never applied.
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <main>
        <ChangeEmail />
      </main>
    </Suspense>
  )
}
