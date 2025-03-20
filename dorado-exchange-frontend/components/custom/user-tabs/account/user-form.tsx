'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { MailCheck, MailWarning, MailX, UserCheck2, UserX2 } from 'lucide-react'
import { User, userSchema } from '@/types/user'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useUpdateUser, useChangeEmail, useSendVerifyEmail } from '@/lib/queries/useAuth'
import { useUserStore } from '@/store/useUserStore'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

export default function UserForm() {
  const { user, userPending } = useUserStore()
  const updateUserMutation = useUpdateUser()
  const changeEmailMutation = useChangeEmail()
  const sendEmailVerificationMutation = useSendVerifyEmail()

  const [isIdentityVerified] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const defaultValues: User = {
    id: user?.id ?? '',
    email: '',
    name: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    emailVerified: false,
    image: '',
    role: '',
  }

  const userForm = useForm<User>({
    resolver: zodResolver(userSchema),
    mode: 'onSubmit',
    defaultValues: user || defaultValues,
    values: user,
  })

  const handleUserSubmit = async (values: User) => {
    if (user.email !== values.email) {
      changeEmailMutation.mutate(values.email)
    }

    if (user.name !== values.name) {
      updateUserMutation.mutate({ name: values.name })
    }
  }

  const handleEmailVerification = () => {
    if (user) {
      sendEmailVerificationMutation.mutate(user?.email, {
        onSettled: () => {
          setEmailSent(true)
          setTimeout(() => setEmailSent(false), 20000)
        },
      })
    }
  }

  return (
    <div>
      {userPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
        </div>
      ) : (
        <div>
          <h2 className="secondary-text mb-10">Account Information</h2>
          <div className="flex items-center mb-8">
            {user?.emailVerified ? (
              <div className="flex items-center gap-2 mr-auto">
                <MailCheck className="text-green-500 h-5 w-5" />
                <div className="text-sm">Email Verified</div>
              </div>
            ) : emailSent ? (
              <div className="flex items-center gap-2 mr-auto">
                <MailWarning className="text-yellow-500 h-5 w-5" />
                <div className="text-sm">Check email inbox for link.</div>
              </div>
            ) : (
              <div className="flex items-center mr-auto">
                <Button
                  variant="link"
                  size="sm"
                  className="text-md flex items-center text-neutral-800 bg-background hover:bg-background hover:no-underline font-light hover:font-normal px-0"
                  onClick={() => handleEmailVerification()}
                >
                  <MailX size={20} className="text-destructive" />
                  Verify Email
                </Button>
              </div>
            )}
            {isIdentityVerified ? (
              <div className="flex items-center gap-2 ml-auto">
                <UserCheck2 className="text-green-500 h-5 w-5" />
                <div className="text-sm">Identity Verified</div>
              </div>
            ) : (
              <div className="flex items-center ml-auto">
                <Button
                  variant="link"
                  size="sm"
                  className="text-md flex items-center text-neutral-800 bg-background hover:bg-background hover:no-underline font-light hover:font-normal px-0"
                  onClick={() => handleEmailVerification()}
                >
                  <UserX2 size={20} className="text-destructive" />
                  Verify Identity
                </Button>
              </div>
            )}
          </div>

          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(handleUserSubmit)} className="space-y-4">
              <div className="mb-8">
                <FormField
                  control={userForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <div className="relative w-full">
                        <FormControl>
                          <FloatingLabelInput
                            label="Email"
                            type="email"
                            autoComplete="email"
                            size="sm"
                            className="input-floating-label-form"
                            {...field}
                          />
                        </FormControl>
                        {changeEmailMutation.isSuccess && user.emailVerified === true ? (
                          <p className="text-sm font-light">
                            An email has been sent to confirm the change. Please follow that link
                            before making further changes.
                          </p>
                        ) : null}
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="mb-8">
                <FormField
                  control={userForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <div className="relative w-full">
                        <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                      </div>
                      <FormControl>
                        <FloatingLabelInput
                          label="Name"
                          type="name"
                          autoComplete="name"
                          size="sm"
                          className="input-floating-label-form"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="submit"
                className="form-submit-button"
                disabled={updateUserMutation.isPending || changeEmailMutation.isPending}
              >
                {updateUserMutation.isPending || changeEmailMutation.isPending
                  ? 'Saving...'
                  : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  )
}
