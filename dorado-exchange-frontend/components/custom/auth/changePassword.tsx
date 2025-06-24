'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useChangePassword } from '@/lib/queries/useAuth'
import { ChangePassword, changePasswordSchema } from '@/types/auth'
import { ValidatedField } from '@/components/ui/validated_field'
import { PasswordRequirements } from './passwordRequirements'

export default function ChangePasswordForm() {
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

  const onSubmit = async (values: ChangePassword) => {
    changePassword.mutate(
      { newPassword: values.newPassword, currentPassword: values.currentPassword },
      {
        onSuccess: () => {
          form.reset()
          router.push('/account')
        },
      }
    )
  }

  return (
    <div className="flex justify-center w-full">
      <div className="flex flex-col w-full max-w-lg gap-6">
        <p className="text-xs text-neutral-600 tracking-widest mr-auto uppercase">Reset Password</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-6">
              <ValidatedField
                control={form.control}
                name="currentPassword"
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                showPasswordButton
                showPassword={showCurrentPassword}
                setShowPassword={setShowCurrentPassword}
                showOnTouch={true}
                showIcon={false}
              />

              <div className="flex flex-col gap-1 mb-4">
                <ValidatedField
                  control={form.control}
                  name="newPassword"
                  label="New Password"
                  type={showNewPassword ? 'text' : 'password'}
                  showPasswordButton
                  showPassword={showNewPassword}
                  setShowPassword={setShowNewPassword}
                  showOnTouch={true}
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
              variant="default"
              disabled={changePassword.isPending}
              className="form-submit-button liquid-gold raised-off-page shine-on-hover !mb-0"
            >
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
