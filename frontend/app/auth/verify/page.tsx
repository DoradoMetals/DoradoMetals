'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirmChange, useSendCode, useVerifyCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useCaptcha } from '@/shared/hooks/useCaptcha'
import { useAdoptSession } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { codeStateFor, messageOf } from '@/shared/utils/authForm'

// How long the "Code verified" alert stays before the flow moves on.
const HANDOVER_MS = 900

export default function Page() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const { verification, setVerification, setConfirmed } = useVerification()
  const verifyCode = useVerifyCode()
  const confirmChange = useConfirmChange()
  const sendCode = useSendCode()
  const captcha = useCaptcha()
  const adopt = useAdoptSession()

  const view = verification?.view ?? null
  const state = view ? codeStateFor(view) : null
  const purpose = view?.purpose

  // A reload empties the flow, and there is no code to enter without it.
  useEffect(() => {
    if (!verification) router.replace('/auth/sign-in')
  }, [verification, router])

  useEffect(() => {
    if (state === 'locked') router.replace('/auth/locked')
  }, [state, router])

  useEffect(() => {
    if (state !== 'otp-success' || !purpose) return
    const timer = setTimeout(() => {
      adopt()
      setVerification(null)
      router.replace('/')
    }, HANDOVER_MS)
    return () => clearTimeout(timer)
  }, [state, purpose, adopt, setVerification, router])

  if (!verification || !view || !state || state === 'locked') return null

  const changing = purpose === 'change_email' || purpose === 'change_phone'
  // `confirm_change` answers an ERROR for a wrong code, not a view carrying the
  // attempts left, so the error state is the mutation's here (API gap).
  const shown = changing && confirmChange.isError ? 'otp-error' : state

  const submit = async () => {
    if (changing) {
      const confirmed = await confirmChange.mutateAsync({ code })
      setConfirmed(confirmed)
      setVerification(null)
      router.replace(`/settings/${confirmed.factor === 'email' ? 'email' : 'phone'}/confirmed`)
      return
    }
    const next = await verifyCode.mutateAsync({
      channel: verification.channel,
      phone_number: verification.phone_number,
      email: verification.email,
      code,
    })
    setVerification({ ...verification, view: next })
  }

  const resend = async () => {
    const next = await sendCode.mutateAsync({
      channel: verification.channel,
      phone_number: verification.phone_number,
      email: verification.email,
      captcha_token: await captcha('resend'),
    })
    setVerification({ ...verification, view: next })
    setCode('')
  }

  return (
    <AuthForm
      state={shown}
      view={view}
      code={code}
      onCodeChange={setCode}
      onSubmit={submit}
      onResend={resend}
      pending={verifyCode.isPending || confirmChange.isPending || sendCode.isPending}
      message={changing ? messageOf(confirmChange.error) : null}
    />
  )
}
