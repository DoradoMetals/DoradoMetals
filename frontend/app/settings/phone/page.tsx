'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChangePhone, useStepUp } from '@dorado/client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { protectedRoutes } from '@/shared/types/routes'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'
import { isStepUpRequired, messageOf } from '@/shared/utils/authForm'

function ChangePhone() {
  const router = useRouter()
  const [digits, setDigits] = useState('')
  const changePhone = useChangePhone()
  const stepUp = useStepUp()
  const { setVerification } = useVerification()

  const submit = async () => {
    try {
      const view = await changePhone.mutateAsync({ phone_number: `+1${digits}` })
      setVerification({ view, channel: view.channel, next: '/settings/phone' })
      router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
    } catch (error) {
      if (!isStepUpRequired(error)) throw error
      const view = await stepUp.mutateAsync()
      setVerification({ view, channel: view.channel, next: '/settings/phone' })
      router.push('/auth/verify/step-up')
    }
  }

  return (
    <AuthForm
      state="change-phone"
      value={formatPhoneNumber(digits)}
      onValueChange={(next) => setDigits(normalizePhone(next))}
      onSubmit={submit}
      pending={changePhone.isPending || stepUp.isPending}
      message={isStepUpRequired(changePhone.error) ? null : messageOf(changePhone.error)}
    />
  )
}

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.settingsPhone.roles}>
      <ChangePhone />
    </ProtectedPage>
  )
}
