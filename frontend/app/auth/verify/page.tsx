'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirmChange, useSendCode, useVerifyCode } from '@dorado/client'

import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { getSession } from '@/shared/hooks/auth/authClient'
import { useAdoptSession } from '@/shared/hooks/auth/queries'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { codeStateFor, messageOf } from '@/shared/utils/authForm'
import { landingFor } from '@/shared/utils/returnTo'

const HANDOVER_MS = 900

export default function Page() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const { verification, setVerification, setConfirmed } = useVerification()
  const verifyCode = useVerifyCode()
  const confirmChange = useConfirmChange()
  const sendCode = useSendCode()
  const adopt = useAdoptSession()

  const leaving = useRef(false)

  const view = verification?.view ?? null
  const state = view ? codeStateFor(view) : null
  const purpose = view?.purpose

  useEffect(() => {
    if (!verification && !leaving.current) router.replace('/auth/sign-in')
  }, [verification, router])

  useEffect(() => {
    if (state === 'locked') router.replace('/auth/locked')
  }, [state, router])

  useEffect(() => {
    if (state !== 'otp-success' || !purpose) return
    leaving.current = true
    const next = verification?.next ?? null
    const timer = setTimeout(async () => {
      const session = await getSession().catch(() => null)
      adopt()
      setVerification(null)
      router.replace(landingFor(session?.data?.user?.role ?? null, next))
    }, HANDOVER_MS)
    return () => clearTimeout(timer)
  }, [state, purpose, verification?.next, adopt, setVerification, router])

  if (!verification || !view || !state || state === 'locked') return null

  const changing = purpose === 'change_email' || purpose === 'change_phone'
  const shown = changing && confirmChange.isError ? 'otp-error' : state

  const submit = async () => {
    if (changing) {
      const confirmed = await confirmChange.mutateAsync({ code })
      setConfirmed(confirmed)
      leaving.current = true
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
