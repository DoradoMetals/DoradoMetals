'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/shared/ui/base/form'
import { Button } from '@/shared/ui/base/button'
import { MailCheck, MailWarning, MailX, UserX2 } from 'lucide-react'
import { User, userSchema } from '@/features/users/types'
import { Skeleton } from '@/shared/ui/base/skeleton'
import {
  useUpdateUser,
  useChangeEmail,
  useSendVerifyEmail,
  useGetSession,
} from '@/features/auth/queries'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'
import { AccountAction } from '@/features/users/ui/AccountAction'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

export default function UserForm() {
  const { user, isPending } = useGetSession()
  const updateUserMutation = useUpdateUser()
  const changeEmailMutation = useChangeEmail()
  const sendEmailVerificationMutation = useSendVerifyEmail()
  const [emailSent, setEmailSent] = useState(false)

  const defaultValues: User = {
    id: user?.id ?? '',
    email: user?.email ?? '',
    name: user?.name ?? '',
    createdAt: user?.createdAt ?? new Date(),
    updatedAt: user?.updatedAt ?? new Date(),
    emailVerified: user?.emailVerified ?? false,
    role: user?.role ?? '',
    stripeCustomerId: user?.stripeCustomerId ?? '',
    dorado_funds: user?.dorado_funds ?? 0,
  }

  const userForm = useForm<User>({
    resolver: zodResolver(userSchema),
    mode: 'onSubmit',
    defaultValues,
  })

  const handleUserSubmit = async (values: User) => {
    if (user?.email !== values.email) {
      changeEmailMutation.mutate(values.email)
    }

    if (user?.name !== values.name) {
      updateUserMutation.mutate({ name: values.name })
    }
  }

  const handleEmailVerification = () => {
    if (!user) return
    sendEmailVerificationMutation.mutate(user.email, {
      onSettled: () => {
        setEmailSent(true)
        setTimeout(() => setEmailSent(false), 20000)
      },
    })
  }

  if (isPending) {
    return (
      <section className="w-full bg-card raised-off-page p-4 rounded-lg">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-40" />
          <div className="h-px w-full bg-neutral-200 my-4" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    )
  }

  const emailVerified = !!user?.emailVerified

  let EmailIcon = MailX

  if (emailVerified) {
    EmailIcon = MailCheck
  } else if (emailSent) {
    EmailIcon = MailWarning
  }

  const emailDescription = emailVerified
    ? 'Email verified.'
    : emailSent
    ? 'Check your email inbox for the verification link.'
    : 'Verify your email to keep your account secure.'

  const emailButtonLabel = emailVerified ? 'Verified' : emailSent ? 'Link Sent' : 'Verify'

  const emailButtonDisabled =
    emailVerified || emailSent || sendEmailVerificationMutation.isPending

  const emailButtonOnClick =
    !emailVerified && !emailSent ? handleEmailVerification : undefined

  return (
    <section className="w-full bg-card raised-off-page p-4 rounded-lg">
      <div className="border-b border-neutral-200 pb-6 mb-6">
        <p className="text-xs text-neutral-500 mb-6 uppercase tracking-widest">Details</p>

        <Form {...userForm}>
          <form onSubmit={userForm.handleSubmit(handleUserSubmit)} className="space-y-5">
            <ValidatedField
              control={userForm.control}
              name="name"
              label="Name"
              type="text"
              className="bg-highest border-1 border-border"
              showIcon={false}
            />

            <div className="space-y-1">
              <ValidatedField
                control={userForm.control}
                name="email"
                label="Email"
                type="email"
                className="bg-highest border-1 border-border"
                showIcon={false}
              />
              {changeEmailMutation.isSuccess && user?.emailVerified === true && (
                <p className="mt-1 text-xs text-neutral-500">
                  An email has been sent to confirm the change. Follow that link before making
                  further changes.
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="secondary"
              className="w-full mb-8 raised-off-page"
              disabled={updateUserMutation.isPending || changeEmailMutation.isPending}
            >
              {updateUserMutation.isPending || changeEmailMutation.isPending
                ? 'Saving...'
                : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </div>

      <div className="border-b border-neutral-200 pb-6 mb-6">
        <p className="text-xs text-neutral-500 mb-4 uppercase tracking-widest">Verification</p>

        <div className="space-y-4">
          <AccountAction
            icon={EmailIcon}
            label="Email"
            description={emailDescription}
            buttonLabel={emailButtonLabel}
            onClick={emailButtonOnClick}
            disabled={emailButtonDisabled}
            showCheckOnComplete={emailVerified}
          />

          <AccountAction
            icon={UserX2}
            label="Identity"
            description="Coming soon"
            buttonLabel="Verify"
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-widest">Dorado Credit</p>

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-neutral-500">Current balance</span>
          <span className="text-lg sm:text-xl font-semibold text-neutral-900">
            <PriceNumberFlow value={user?.dorado_funds ?? 0} />
          </span>
        </div>
      </div>
    </section>
  )
}
