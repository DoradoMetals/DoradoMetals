"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { authClient } from "@/lib/authClient";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export function ForgotPasswordDialog() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {

    const { error } = await authClient.forgetPassword(
      { email: values.email },
      {
        onRequest: () => setLoading(true),
        onSuccess: () => {
          setMessage("We have sent a reset link to the provided email if it exists within our system.");
          setLoading(false);
        },
        onError: (ctx) => {
          form.setError("email", { type: "manual", message: ctx.error?.message || "Something went wrong." });
          setLoading(false);
        },
      }
    );

    if (error) {
      form.setError("email", { type: "manual", message: error.message });
      setLoading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-md m-0 p-0">
          Forgot Password?
        </Button>
      </DialogTrigger>
      <DialogContent className="space-y-4">
        <DialogTitle>Reset Password</DialogTitle>
        <DialogDescription>
          Enter your email, and we will send you a reset link.
        </DialogDescription>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      {...field}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" disabled={loading || !form.watch("email")} className="w-full">
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </Form>

        {message && <p className="text-sm text-center text-gray-500">{message}</p>}
      </DialogContent>
    </Dialog>
  );
}
