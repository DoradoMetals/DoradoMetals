'use client'

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
import { useSignUp } from '@/lib/queries/useAuth' // ✅ Import Sign Up Mutation
import Link from 'next/link'
import { Logo } from '@/components/icons/logo'
import googleButton from './googleButton'
import orSeparator from './orSeparator'
import { useState } from 'react'

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  name: z.string().optional(),
})

export default function SignUpForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const signUpMutation = useSignUp() // ✅ Use TanStack Mutation

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', name: '' },
  })

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    signUpMutation.mutate(
      {
        email: values.email,
        password: values.password,
        name: values.name,
      },
      {
        onSuccess: () => {
          router.push('/')
        },
      }
    )
  }

  return (
    <div className="grid place-items-center mt-6">
      <div className="flex flex-col w-full max-w-sm px-5">
        <h2 className="flex items-center text-xl text-neutral-800 justify-center mb-6 text-primary" >
          Sign Up and start exchanging!
        </h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-neutral-600 m-0 p-0">
                    <FormLabel>Name</FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      type="name"
                      autoComplete="name"
                      className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-neutral-600 m-0 p-0">
                    <FormLabel>Email</FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mb-10">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-neutral-600 m-0 p-0">
                      <FormLabel>Password</FormLabel>
                    </div>
                    <FormControl>
                      <div className="relative flex items-center">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowPassword(!showPassword)}
                          className="ml-[-3rem] hover:bg-transparent"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={signUpMutation.isPending || !form.formState.isValid}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6"
            >
              {signUpMutation.isPending ? 'Signing Up...' : 'Sign Up'}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        {googleButton('Sign Up with Google')}
      </div>
    </div>
  )
}
