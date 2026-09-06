'use client'

import React from 'react'

import { VerificationProvider } from '@/shared/providers/VerificationProvider'

// WHAT IS LEFT OF THE SITE CHROME IS NOTHING (the frontend nuke, ruling 99).
//
// This provider used to decide, per route, whether a page wore the site nav,
// the footer, the drawer backdrop and the `max-w-7xl` column - and whether it
// was one of the full-bleed `/auth` and `/settings` panels instead. Every
// surface that wore the chrome is deleted; the auth panels were always the
// bare branch, and the placeholder homepage composes its own Header, Hero and
// Footer from `@dorado/components`.
//
// So the branch is gone and only the seam remains: this is still the one
// client component mounted around every page, and it is where the nav, the
// footer and the drawer host come back when the first real surface is built.
//
// VerificationProvider stays inside it for the reason it was put here - it
// holds the verification in flight across the `/settings/email` ->
// `/auth/verify` navigation, so it has to outlive both routes.
export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  return <VerificationProvider>{children}</VerificationProvider>
}
