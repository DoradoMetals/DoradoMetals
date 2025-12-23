'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/shared/ui/base/form'
import { Button } from '@/shared/ui/base/button'
import { useChangePassword } from '@/features/auth/queries'
import { ChangePassword, changePasswordSchema } from '@/features/auth/types'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'
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

  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
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
          <p className="text-xs text-neutral-600 tracking-widest mr-auto uppercase">
            Reset Password
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="space-y-6">
              <ValidatedField
                className="bg-highest border-1 border-border"
                control={form.control}
                name="currentPassword"
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                showPasswordButton
                showPassword={showCurrentPassword}
                setShowPassword={setShowCurrentPassword}
                showOnTouch
                showIcon={false}
              />

              <div className="flex flex-col gap-1 mb-4">
                <ValidatedField
                  className="bg-highest border-1 border-border"
                  control={form.control}
                  name="newPassword"
                  label="New Password"
                  type={showNewPassword ? 'text' : 'password'}
                  showPasswordButton
                  showPassword={showNewPassword}
                  setShowPassword={setShowNewPassword}
                  showOnTouch
                  showFormError={false}
                  showIcon={false}
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
              className="w-full mb-8 raised-off-page"
            >
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
