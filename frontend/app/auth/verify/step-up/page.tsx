'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStepUp, useVerifyCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { codeStateFor } from '@/shared/utils/authForm'
import { safeNext } from '@/shared/utils/returnTo'

export default function Page() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const { verification, setVerification } = useVerification()
  const verifyCode = useVerifyCode()
  const stepUp = useStepUp()

  const leaving = useRef(false)

  const view = verification?.view ?? null
  const state = view ? codeStateFor(view) : null

  useEffect(() => {
    if (leaving.current) return
    if (!verification || verification.view.purpose !== 'step_up') router.replace('/account')
  }, [verification, router])

  useEffect(() => {
    if (state === 'locked') router.replace('/auth/locked')
  }, [state, router])

  useEffect(() => {
    if (state !== 'otp-success' || !verification) return
    const next = safeNext(verification.next) ?? '/account'
    leaving.current = true
    setVerification(null)
    router.replace(next)
  }, [state, verification, setVerification, router])

  if (!verification || !view || !state || state === 'locked' || state === 'otp-success') return null

  const submit = async () => {
    const next = await verifyCode.mutateAsync({
      channel: verification.channel,
      phone_number: verification.phone_number,
      email: verification.email,
      code,
    })
    setVerification({ ...verification, view: next })
  }

  const resend = async () => {
    const next = await stepUp.mutateAsync()
    setVerification({ ...verification, view: next })
    setCode('')
  }

  return (
    <AuthForm
      state={state}
      view={view}
      code={code}
      onCodeChange={setCode}
      onSubmit={submit}
      onResend={resend}
      pending={verifyCode.isPending || stepUp.isPending}
    />
  )
}
