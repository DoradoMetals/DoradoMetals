'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { Logo } from '@/components/icons/logo'
import { ForgotPasswordDialog } from './forgotPasswordDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useSignIn } from '@/lib/queries/useAuth' // Import TanStack Mutation

import orSeparator from './orSeparator'
import googleButton from './googleButton'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password required' }),
  rememberMe: z.boolean().default(true),
})

export default function SignInForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  const signInMutation = useSignIn() // Use TanStack Mutation

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    signInMutation.mutate(values, {
      onSuccess: () => {
        router.push('/')
      },
      onError: (error) => {
        form.setError('password', { type: 'manual', message: error.message })
      },
    })
  }

  return (
    <div className="grid place-items-center mt-6">
      <div className="flex flex-col w-full max-w-sm px-5">
        <h2 className="flex items-center text-xl text-neutral-800 justify-center mb-6">
          Welcome Back!
        </h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <FloatingLabelInput
                      label="Email"
                      type="email"
                      autoComplete="email"
                      size="xs"
                      className="bg-card placeholder:font-light font-normal shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        size="xs"
                        className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>

                  <div className="flex justify-between items-center w-full mt-2">
                    <FormField
                      control={form.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              id="remember-me"
                              className="text-neutral-600 cursor-pointer bg-card border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                            />
                          </FormControl>
                          <FormLabel
                            htmlFor="remember-me"
                            className="text-xs cursor-pointer text-neutral-600 m-0 p-0"
                          >
                            Remember Me
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    <div className="text-sm">
                      <ForgotPasswordDialog />
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="default"
              disabled={signInMutation.isPending}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6 shadow-lg"
            >
              {signInMutation.isPending ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        {googleButton('Sign In with Google')}
      </div>
    </div>
  )
}
