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
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/icons/logo";
import { ForgotPasswordDialog } from "./forgotPasswordDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useSignIn } from "@/lib/queries/useAuth"; // Import TanStack Mutation

import orSeparator from "./orSeparator";
import googleButton from "./googleButton";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string(),
  rememberMe: z.boolean().default(true),
});

export default function SignInForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const signInMutation = useSignIn(); // Use TanStack Mutation

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    signInMutation.mutate(values, {
      onSuccess: () => {
        router.push("/");
      },
      onError: (error) => {
        form.setError("password", { type: "manual", message: error.message });
      },
    });
  };

  return (
    <div className="h-screen grid place-items-center">
      <div className="flex flex-col w-full max-w-sm px-5">
        <div className="flex items-center mb-10">
          <div className="mr-auto">
            <Link href={"/"}>
              <Logo size={50} />
            </Link>
          </div>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>

        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Sign In</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel>Email</FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter email..."
                      autoComplete="email"
                      className="placeholder:font-light font-normal"
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
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Password</FormLabel>
                    </div>
                  <FormControl>
                    
                    <div className="relative flex-col w-full">
                      <div className="flex items-center mb-2">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter password..."
                          autoComplete="current-password"
                          className="placeholder:font-light font-normal"
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

                      <div className="flex justify-between items-center w-full">
                        <FormField
                          control={form.control}
                          name="rememberMe"
                          render={({ field }) => (
                            <FormItem className="flex items-center">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  id="remember-me"
                                  className="cursor-pointer"
                                />
                              </FormControl>
                              <FormLabel
                                htmlFor="remember-me"
                                className="text-xs cursor-pointer text-gray-500 m-0 p-0"
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
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="default"
              disabled={signInMutation.isPending}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6"
            >
              {signInMutation.isPending ? "Signing In..." : "Sign In"}
            </Button>
          </form>
        </Form>

        {orSeparator()}

        {googleButton("Sign In with Google")}

        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-4">
          New here?{" "}
          <Link href="/sign-up" className="text-primary font-medium">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
