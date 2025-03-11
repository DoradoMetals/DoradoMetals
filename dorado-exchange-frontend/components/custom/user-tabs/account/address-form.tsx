"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StateSelect } from "./stateSelect";
import { useUserStore } from "@/store/useUserStore";
import { useAddress, useUpdateAddress } from "@/lib/queries/useAddresses";
import { AddressForm, addressFormSchema } from "@/types/address";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton"; // Assuming you're using shadcn or a similar Skeleton

export default function AddressManager() {
  const { user, userPending } = useUserStore();
  const { data: address, isLoading } = useAddress(user?.id);
  const updateAddressMutation = useUpdateAddress(user?.id);

  const addressForm = useForm<AddressForm>({
    resolver: zodResolver(addressFormSchema),
    mode: 'onChange',
    defaultValues: address || {
      id: crypto.randomUUID(),
      line_1: "",
      line_2: "",
      city: "",
      state: "",
      country: "United States",
      zip: "",
    },
  });

  const handleAddressSubmit = (values: AddressForm) => {
    updateAddressMutation.mutate(values);
  };

  useEffect(() => {
    if (address) {
      addressForm.reset(address);
    }
  }, [address]);

  return (
    <div>
      <h2 className="text-sm text-gray-500 mb-10">Addresses</h2>

      {/* ✅ Show Skeletons While Loading */}
      {isLoading || userPending ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" /> {/* Address Line 1 */}
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" /> {/* Address Line 2 */}
            <Skeleton className="h-10 w-full" /> {/* City */}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" /> {/* Zip Code */}
            <Skeleton className="h-10 w-full" /> {/* State Dropdown */}
          </div>
          <Skeleton className="h-10 w-full" /> {/* Submit Button */}
        </div>
      ) : (
      <Form {...addressForm}>
        <form onSubmit={addressForm.handleSubmit(handleAddressSubmit)} className="space-y-4">

          {/* Address Line 1 */}
          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="line_1"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel>Address Line 1</FormLabel>
                  </div>
                  <FormControl>
                    <Input placeholder="Address Line 1" className="placeholder:font-light font-normal" {...field} />
                  </FormControl>
                  {addressForm.formState.errors.line_1 && (
                    <p className="text-red-500 text-sm">
                      {addressForm.formState.errors.line_1.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>

          {/* Address Line 2 & City */}
          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="line_2"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Address Line 2</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="Address Line 2" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={addressForm.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>City</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="City" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>

                  </FormItem>
                )}
              />
            </div>
            <div className="flex">
            {addressForm.formState.errors.city && (
              <p className="ml-auto text-red-500 text-sm">
                {addressForm.formState.errors.city.message}
              </p>
            )}
            </div>
          </div>

          {/* Zip & State */}
          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Zip Code</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="Zip Code" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={addressForm.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <StateSelect value={field.value} onChange={field.onChange} />
                  </FormItem>
                )}
              />
            </div>
            {addressForm.formState.errors.zip && (
              <p className="text-red-500 text-sm">
                {addressForm.formState.errors.zip.message}
              </p>
            )}
          </div>

          {/* Country (Read-Only) */}
          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel>Country</FormLabel>
                  </div>
                  <FormControl>
                    <Input readOnly placeholder="United States" className="placeholder:font-light font-normal" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Submit Button with Loading State */}
          <Button type="submit" className="w-full" disabled={updateAddressMutation.isPending}>
            {updateAddressMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </Form>
      )}
    </div>  
  );
}
