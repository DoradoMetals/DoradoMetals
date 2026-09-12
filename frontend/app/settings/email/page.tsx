'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChangeEmail, useStepUp } from '@dorado/client'

import ProtectedPage from '@/shared/hooks/useProtectedPage'
import { AuthForm } from '@/shared/ui/auth/AuthForm'
import { useVerification } from '@/shared/providers/VerificationProvider'
import { protectedRoutes } from '@/shared/types/routes'
import { isStepUpRequired, messageOf } from '@/shared/utils/authForm'

function ChangeEmail() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const changeEmail = useChangeEmail()
  const stepUp = useStepUp()
  const { setVerification } = useVerification()

  const submit = async () => {
    try {
      const view = await changeEmail.mutateAsync({ email })
      setVerification({ view, channel: view.channel, next: '/settings/email' })
      router.push(view.status === 'locked' ? '/auth/locked' : '/auth/verify')
    } catch (error) {
      if (!isStepUpRequired(error)) throw error
      const view = await stepUp.mutateAsync()
      setVerification({ view, channel: view.channel, next: '/settings/email' })
      router.push('/auth/verify/step-up')
    }
  }

  return (
    <AuthForm
      state="change-email"
      value={email}
      onValueChange={setEmail}
      onSubmit={submit}
      pending={changeEmail.isPending || stepUp.isPending}
      message={isStepUpRequired(changeEmail.error) ? null : messageOf(changeEmail.error)}
    />
  )
}

export default function Page() {
  return (
    <ProtectedPage requiredRoles={protectedRoutes.settingsEmail.roles}>
      <ChangeEmail />
    </ProtectedPage>
  )
}
