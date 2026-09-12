'use client'

import React from 'react'

import { VerificationProvider } from '@/shared/providers/VerificationProvider'

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  return <VerificationProvider>{children}</VerificationProvider>
}
