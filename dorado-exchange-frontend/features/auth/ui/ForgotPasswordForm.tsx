'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/base/dialog'
import { Button } from '@/shared/ui/base/button'
import { Form } from '@/shared/ui/base/form'
import { useRequestPasswordReset } from '@/features/auth/queries'
import { ValidatedField } from '@/shared/ui/form/ValidatedField'

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
})

export function ForgotPasswordDialog() {
  const forgotPasswordMutation = useRequestPasswordReset()

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    forgotPasswordMutation.mutate(values.email, {
      onSuccess: () => {
        form.setValue('email', '')
      },
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-xs text-neutral-600 p-0">
          Forgot Password?
        </Button>
      </DialogTrigger>
      <DialogContent className="">
        <DialogTitle className="text-neutral-800 text-lg">Reset Password</DialogTitle>
        <DialogDescription className="mb-6">
          Enter your email, and we will send you a reset link.
        </DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <ValidatedField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              disabled={forgotPasswordMutation.isPending}
              showOnTouch={true}
            />

            <Button
              type="submit"
              disabled={forgotPasswordMutation.isPending || !form.watch('email')}
              className="w-full mb-8 text-white raised-off-page bg-primary hover:bg-primary"
            >
              {forgotPasswordMutation.isPending ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>
        </Form>

        {forgotPasswordMutation.isSuccess && (
          <p className="text-center text-sm text-neutral-700">
            We have sent a reset link to the provided email if it exists within our system.
          </p>
        )}

        {forgotPasswordMutation.isError && (
          <p className="text-center text-sm text-destructive">
            {forgotPasswordMutation.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
