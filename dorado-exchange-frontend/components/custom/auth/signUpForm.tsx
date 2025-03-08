"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/authClient";
import Link from "next/link";
import { Logo } from "@/components/icons/logo";
import googleButton from "./googleButton";
import orSeparator from "./orSeparator";

// ✅ Validation schema with name as OPTIONAL
const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  name: z.string().optional(),
});

export default function SignUpForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Hook form with schema validation
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", name: "" },
  });

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    const { error } = await authClient.signUp.email(
      {
        email: values.email,
        password: values.password,
        name: '',
        callbackURL: "/verify-email",
      },
      {
        onRequest: (ctx) => {
          setLoading(true);
        },
        onSuccess: (ctx) => {
          setLoading(false);
          router.push("/");
        },
        onError: (ctx) => {
          setLoading(false)
        },
      }
    );
    if (error) {
      form.setError('password', { type: 'manual', message: error?.message })
    }
  };

  return (
    <div className="h-screen grid place-items-center">
      <div className="flex flex-col w-full max-w-sm px-5">
        <div className="flex items-center mb-10">
          <Link href={"/"}>
            <Logo size={50} />
          </Link>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>

        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Sign Up</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Name (Optional) */}
            {/* <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (Optional)</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Name (Optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            /> */}

            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  {/* <FormLabel>Email</FormLabel> */}
                  <FormControl>
                    <Input type="email" placeholder="Email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <div className="mb-10">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    {/* <FormLabel>Password</FormLabel> */}
                    <FormControl>
                      <div className="relative flex items-center">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          autoComplete="new-password"
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


            {/* Submit Button - Disabled Until Valid */}
            <Button
              type="submit"
              variant="default"
              disabled={loading || !form.formState.isValid}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6"
            >
              {loading ? "Signing Up..." : "Sign Up"}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        {googleButton('Sign Up with Google')}

        {/* Sign In Link */}
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-4">
          Already a member?{" "}
          <Link href="/sign-in" className="text-primary font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
