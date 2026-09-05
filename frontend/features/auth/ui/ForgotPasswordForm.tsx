'use client'

import { useForm } from 'react-hook-form'
import { Form } from '@dorado/components'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  Button,
  ValidatedField,
} from '@dorado/components'
import { useRequestPasswordReset } from '@/features/auth/queries'

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
        <Button variant="tertiary" size="xs">
          Forgot Password?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Reset Password</DialogTitle>
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
            />

            <Button
              type="submit"
              disabled={forgotPasswordMutation.isPending || !form.watch('email')}
              className="w-full mb-8"
            >
              {forgotPasswordMutation.isPending ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>
        </Form>

        {forgotPasswordMutation.isSuccess && (
          <p className="text-center">
            We have sent a reset link to the provided email if it exists within our system.
          </p>
        )}

        {forgotPasswordMutation.isError && (
          <p className="text-center text-destructive">
            {forgotPasswordMutation.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
