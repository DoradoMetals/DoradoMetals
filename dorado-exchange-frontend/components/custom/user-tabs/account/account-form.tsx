"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MailCheck, MailX, UserCheck, UserX } from "lucide-react";

const accountSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export default function AccountForm() {
  const accountForm = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { email: "", firstName: "", lastName: "" },
  });

  const isEmailVerified = true;  // Set to true when email is verified
  const isIdentityVerified = true; // Set to true when identity is verified

  // const verifyEmail = (values: z.infer<typeof accountSchema>) => {
  //   console.log('verify-email')
  // }

  // const verifyIdentity = (values: z.infer<typeof accountSchema>) => {
  //   console.log('verify-identity')
  // }

  const handleAccountSubmit = (values: z.infer<typeof accountSchema>) => {
    console.log("Updating Account Information", values);
  };

  return (
    <div>
      <h2 className="text-sm text-gray-500 mb-10">Account Information</h2>
      <div className="flex items-center mb-6">

        {
          isEmailVerified
            ?
            <div className="flex items-center gap-2 mr-auto pl-5">
              <MailCheck className="text-green-500 h-5 w-5" />
              <div className="font-light text-sm">
                Email Verified
              </div>
            </div>
            :
            <div className="flex items-center gap-2 mr-auto pl-2">
              {/* <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal" onClick={() => verifyEmail()}> */}
              <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal">
                <MailX className="text-red-500 h-5 w-5" />
                Verify Email
              </Button>
            </div>
        }
        {
          isIdentityVerified
            ?
            <div className="flex items-center gap-2 ml-auto pr-5">
              <UserCheck className="text-green-500 h-5 w-5" />
              <div className="font-light text-sm">
                Identity Verified
              </div>
            </div>
            :
            <div className="flex items-center gap-2 ml-auto pr-2">
              {/* <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal" onClick={() => verifyIdentity()}> */}
              <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal">
                <UserX className="text-red-500 h-5 w-5" />
                Verify Identity
              </Button>
            </div>
        }
      </div>
      <Form {...accountForm}>
        <form onSubmit={accountForm.handleSubmit(handleAccountSubmit)} className="space-y-4">

          <div className="mb-8">
            <FormField
              control={accountForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel >Email</FormLabel>
                  </div>

                  <FormControl>
                    <Input type="email" placeholder="Email" className="placeholder:font-light font-normal"{...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={accountForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel >First Name</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="First Name" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={accountForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel >Last Name</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="Last Name" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </Form>
    </div>
  );
}
