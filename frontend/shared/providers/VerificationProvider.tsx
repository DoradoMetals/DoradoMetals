'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { ChangeConfirmedView, OtpChannel, VerificationView } from '@dorado/contracts'

export type Verification = {
  view: VerificationView
  channel: OtpChannel
  phone_number?: string
  email?: string
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
