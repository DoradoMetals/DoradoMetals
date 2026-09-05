'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Form, ValidatedField } from '@dorado/components'
import { useChangePassword } from '@/features/auth/queries'
import { ChangePassword, changePasswordSchema } from '@/features/auth/types'
import { PasswordRequirements } from './PasswordRequirements'

type ChangePasswordFormProps = {
  showTitle?: boolean
  onSuccess?: () => void
}

export default function ChangePasswordForm({
  showTitle = true,
  onSuccess,
}: ChangePasswordFormProps) {
  const router = useRouter()

  const [showRequirements, setShowRequirements] = useState(false)

  const changePassword = useChangePassword()

  const form = useForm<ChangePassword>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { newPassword: '', currentPassword: '' },
    mode: 'onBlur',
  })

  const handleSuccess = () => {
    form.reset()
    if (onSuccess) {
      onSuccess()
    } else {
      router.push('/account')
    }
  }

  const handleSubmit = (values: ChangePassword) => {
    changePassword.mutate(
      { newPassword: values.newPassword, currentPassword: values.currentPassword },
      { onSuccess: handleSuccess }
    )
  }

  return (
    <div className="flex justify-center w-full">
      <div className="flex flex-col w-full gap-6">
        {showTitle && (
          <p className="eyebrow mr-auto">Reset Password</p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="space-y-6">
              <ValidatedField
                control={form.control}
                name="currentPassword"
                label="Current Password"
                type="password"
                showPasswordButton
              />

              <div className="flex flex-col gap-1 mb-4">
                <ValidatedField
                  control={form.control}
                  name="newPassword"
                  label="New Password"
                  type="password"
                  showPasswordButton
                  showFormError={false}
                  inputProps={{
                    onFocus: () => setShowRequirements(true),
                  }}
                />

                {showRequirements && (
                  <PasswordRequirements control={form.control} name="newPassword" />
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="secondary"
              disabled={changePassword.isPending}
              className="w-full mb-8"
            >
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
