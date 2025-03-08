"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { authClient } from "@/lib/authClient";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/icons/logo";

// ✅ Define validation schema using Zod
const formSchema = z
  .object({
    password: z.string().min(6, { message: "Password must be at least 6 characters" }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ✅ Hook form initialization with schema validation
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!token) {
      setMessage("Invalid or missing token.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await authClient.resetPassword(
      {
        newPassword: values.password,
        token,
      },
      {
        onRequest: () => setLoading(true),
        onSuccess: () => {
          setMessage("Password reset successful! Redirecting...");
          setTimeout(() => router.push("/sign-in"), 3000);
        },
        onError: (ctx) => {
          setMessage(ctx.error?.message || "Something went wrong.");
        },
      }
    );

    setLoading(false);
    if (error) {
      form.setError("password", { type: "manual", message: error.message });
    }
  };

  return (
    <div className="h-screen grid place-items-center">
      <div className="flex flex-col w-full max-w-sm px-5">
        {/* Logo and Title */}
        <div className="flex items-center mb-10">
          <div className="mr-auto">
            <Link href={"/"}>
              <Logo size={50} />
            </Link>
          </div>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>

        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Reset Password</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* New Password */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative flex-col w-full">
                      <div className="flex items-center">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="New Password"
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
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Confirm Password */}
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative flex-col w-full">
                      <div className="flex items-center">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Confirm New Password"
                          autoComplete="new-password"
                          {...field}
                        />
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="default"
              disabled={loading}
              className="group-invalid:pointer-events-none group-invalid:opacity-30 w-full mb-6"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </Form>

        {/* Display error or success messages */}
        {message && <p className="text-sm text-center text-gray-500">{message}</p>}
      </div>
    </div>
  );
}
