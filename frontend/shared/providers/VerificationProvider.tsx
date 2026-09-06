'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { ChangeConfirmedView, OtpChannel, VerificationView } from '@dorado/contracts'

// THE CODE SCREEN NEEDS TO KNOW WHOSE CODE IT IS, and the answer cannot go on
// the URL: the raw number or address is what `verify_code` posts back, and the
// design masks that value everywhere. So the verification in flight lives here,
// in memory, for as long as the flow does. It is not a cache of server data -
// a reload empties it and the route sends the customer back to the start.
export type Verification = {
  view: VerificationView
  channel: OtpChannel
  // The unmasked identity the code went to. Never rendered; only posted back.
  phone_number?: string
  email?: string
  // Where the flow returns once the code is accepted.
  next?: string
}

type Value = {
  verification: Verification | null
  setVerification: (next: Verification | null) => void
  confirmed: ChangeConfirmedView | null
  setConfirmed: (next: ChangeConfirmedView | null) => void
}

const VerificationContext = createContext<Value | null>(null)

export function VerificationProvider({ children }: { children: React.ReactNode }) {
  const [verification, setVerification] = useState<Verification | null>(null)
  const [confirmed, setConfirmed] = useState<ChangeConfirmedView | null>(null)
  const value = useMemo(
    () => ({ verification, setVerification, confirmed, setConfirmed }),
    [verification, confirmed]
  )
  return <VerificationContext.Provider value={value}>{children}</VerificationContext.Provider>
}

export function useVerification(): Value {
  const value = useContext(VerificationContext)
  if (!value) throw new Error('useVerification must be used inside VerificationProvider')
  return value
}
