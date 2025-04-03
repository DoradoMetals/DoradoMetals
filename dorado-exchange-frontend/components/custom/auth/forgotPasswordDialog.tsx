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
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { useForgotPassword } from '@/lib/queries/useAuth'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
})

export function ForgotPasswordDialog() {
  const forgotPasswordMutation = useForgotPassword()

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
        <DialogTitle className='text-neutral-800 text-lg'>Reset Password</DialogTitle>
        <DialogDescription className='mb-6'>Enter your email, and we will send you a reset link.</DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormMessage className="absolute right-0 -top-3 -translate-y-1/2 error-text" />
                  </div>
                  <FormControl>
                    <FloatingLabelInput
                      label="Email"
                      type="email"
                      autoComplete="email"
                      disabled={forgotPasswordMutation.isPending}
                      size="sm"
                      className="input-floating-label-form"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={forgotPasswordMutation.isPending || !form.watch('email')}
              className="form-submit-button"
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
