"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { useForgotPassword } from "@/lib/queries/useAuth"; // Import TanStack Mutation
import { FloatingLabelInput } from "@/components/ui/floating-label-input";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export function ForgotPasswordDialog() {
  const forgotPasswordMutation = useForgotPassword(); // Use TanStack Mutation

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    forgotPasswordMutation.mutate(values.email, {
      onSuccess: () => {
        form.setValue("email", ""); // Clear input field
      },
    });
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
                <FormItem className="w-full">
                  <div className="relative w-full">
                    <FormControl>
                      <FloatingLabelInput
                        label="Email"
                        type="email"
                        autoComplete="email"
                        disabled={forgotPasswordMutation.isPending}
                        size="xs"
                        className="bg-card placeholder:font-light font-normal border-none shadow-[inset_0_1px_1px_hsla(0,0%,0%,0.15),inset_0_-1px_1px_hsla(0,0%,0%,0.2)] dark:shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.15),inset_0_-1px_1px_hsla(0,0%,100%,0.2)]"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={forgotPasswordMutation.isPending || !form.watch("email")} className="w-full">
              {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </Form>

        {forgotPasswordMutation.isSuccess && (
          <p className="text-sm text-center text-gray-500">
            We have sent a reset link to the provided email if it exists within our system.
          </p>
        )}

        {forgotPasswordMutation.isError && (
          <p className="text-sm text-center text-red-500">
            {forgotPasswordMutation.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
