"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MailCheck, MailWarning, MailX, UserCheck2, UserX2 } from "lucide-react";
import { User, userSchema } from "@/types/user";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpdateUser, useChangeEmail, useSendVerifyEmail } from "@/lib/queries/useAuth";
import { useUserStore } from "@/store/useUserStore";

export default function UserForm() {
  const { user, userPending } = useUserStore();
  const updateUserMutation = useUpdateUser();
  const changeEmailMutation = useChangeEmail();
  const sendEmailVerificationMutation = useSendVerifyEmail();

  const [isIdentityVerified] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const defaultValues: User = {
    id: user?.id ?? '',
    email: '',
    name: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    emailVerified: false,
    image: '',
    role: '',
  };

  const userForm = useForm<User>({
    resolver: zodResolver(userSchema),
    mode: 'onSubmit',
    defaultValues: user || defaultValues,
    values: user,
  })

  const handleUserSubmit = async (values: User) => {
    if (user.email !== values.email) {
      changeEmailMutation.mutate(values.email);
    }

    if (user.name !== values.name) {
      updateUserMutation.mutate({ name: values.name });
    }
  };

  const handleEmailVerification = () => {
    if (user) {
      sendEmailVerificationMutation.mutate(user?.email, {
        onSettled: () => {
          setEmailSent(true)
          setTimeout(() => setEmailSent(false), 20000);
        }
      });
    }
  }

  return (
    <div>
      {userPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
        </div>
      ) : (

        <div>
          <h2 className="text-sm text-gray-500 mb-10">Account Information</h2>
          <div className="flex items-center mb-8">

            {
              user?.emailVerified
                ?
                <div className="flex items-center gap-2 mr-auto">
                  <MailCheck className="text-green-500 h-5 w-5" />
                  <div className="font-light text-sm">
                    Email Verified
                  </div>
                </div>
                :
                emailSent ?
                <div className="flex items-center gap-2 mr-auto">
                  <MailWarning className="text-yellow-500 h-5 w-5" />
                  <div className="font-light text-sm">
                    Check email inbox for link.
                  </div>
                </div>
                :
                <div className="flex items-center gap-2 mr-auto">
                  <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal px-0" onClick={() => handleEmailVerification()}>
                    <MailX className="text-red-500 h-5 w-5" />
                    Verify Email
                  </Button>
                </div>
            }
            {
              isIdentityVerified
                ?
                <div className="flex items-center gap-2 ml-auto">
                  <UserCheck2 className="text-green-500 h-5 w-5" />
                  <div className="font-light text-sm">
                    Identity Verified
                  </div>
                </div>
                :
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" className="font-light text-sm hover:bg-background hover:font-normal px-0">
                    <UserX2 className="text-red-500 h-5 w-5" />
                    Verify Identity
                  </Button>
                </div>
            }
          </div>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(handleUserSubmit)} className="space-y-4">

              <div className="mb-8">
                <FormField
                  control={userForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <div className="text-md text-gray-500 m-0 p-0">
                        <FormLabel>Email</FormLabel>
                      </div>
                      <FormControl>
                        <Input type="email" placeholder="exchange@doradometals.com" className="placeholder:font-light font-normal" {...field} />
                      </FormControl>
                      {changeEmailMutation.isSuccess && user.emailVerified === true ? (
                        <p className="text-sm font-light">
                          An email has been sent to confirm the change. Please follow that link before making further changes.
                        </p>
                      ) : null}
                    </FormItem>
                  )}
                />
              </div>

              <div className="mb-8">
                <FormField
                  control={userForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="text-md text-gray-500 m-0 p-0">
                        <FormLabel >Name</FormLabel>
                      </div>
                      <FormControl>
                        <Input placeholder="John Doe" className="placeholder:font-light font-normal" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="submit"
                className="w-full mb-8"
                disabled={updateUserMutation.isPending || changeEmailMutation.isPending}
              >
                {updateUserMutation.isPending || changeEmailMutation.isPending
                  ? "Saving..."
                  : "Save Changes"}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
}
